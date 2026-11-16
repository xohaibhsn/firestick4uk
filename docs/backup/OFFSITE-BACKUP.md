# Off-site encrypted DB backup (F4UK)

PHASE 1 ships the scripts only. Nothing in the app, Cron, or deploy pipeline invokes them. Backups do not run until an owner completes PHASE 2.

## What it does

`scripts/backup/offsite-db-backup.js` connects with the existing DB env vars, verifies `SELECT DATABASE()` equals `u992747032_firestick4uk`, dumps base tables only (consistent snapshot, read-only), gzip-compresses the SQL, encrypts with AES-256-GCM using `BACKUP_ENC_KEY`, and (unless `--dry-run`) uploads a private Cloudinary raw asset under `firestick4uk-backups/f4uk-db-<UTC>`. It then keeps the newest 12 matching objects in that folder and deletes older matching ones only.

`scripts/backup/decrypt-backup.js` is for the owner on a trusted local machine: decrypt → `.sql.gz`.

## Threat model

- Cloudinary stores ciphertext only. The encryption key never leaves the host (or the owner’s local decrypt session).
- Losing `BACKUP_ENC_KEY` makes historical backups unreadable.
- The dump never emits `USE` / `CREATE DATABASE` / `DEFINER` / triggers / views / routines.
- Status lines print sizes, hashes, table counts, and public_id — never row payloads.

## File format (`F4UKBK1`)

Binary layout (little documentation, big-endian lengths):

| Region | Bytes | Meaning |
| --- | --- | --- |
| magic | 7 | ASCII `F4UKBK1` |
| version | 1 | `0x01` |
| manifest_len | 4 | uint32 BE length of the following manifest blob |
| manifest blob | N | `IV(12) \|\| ciphertext \|\| tag(16)` — AES-256-GCM of UTF-8 JSON |
| data blob | rest | `IV(12) \|\| ciphertext \|\| tag(16)` — AES-256-GCM of the gzip SQL |

Manifest JSON fields include: `script_version`, `utc`, `database`, `tables` (name→row count), `table_count`, `total_rows`, `gzip_bytes`, `gzip_sha256`, `public_id`.

Key: `BACKUP_ENC_KEY` = 64 hex characters (32 bytes).

## Flags / exit codes (backup)

| Flag | Purpose |
| --- | --- |
| `--dry-run` | Dump + encrypt in temp, print summary, delete temps, no upload |
| `--expect-db <name>` | Tests only — override expected database name |
| `--keep-local <path>` | Tests only — copy ciphertext; refuses repo/`public/` paths |

| Exit | Meaning |
| --- | ---: |
| 0 | success |
| 2 | missing/invalid key or env / bad flags |
| 3 | wrong database |
| 1/4 | other failure |

## Env names (no values)

DB: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, optional `DB_PORT`.

Cloudinary: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

Backup: `BACKUP_ENC_KEY`.

## PHASE 2 OWNER STEPS (not executed in PHASE 1)

1. **Generate a key locally** (never on a shared screen log):

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Store it in a password manager **and** an offline copy. Losing it = backups unreadable.

2. **Add `BACKUP_ENC_KEY` in hPanel** → Environment variables via the UI. Do **not** use MCP `hosting_nodejs_replace-environment-variables` (full replace risk). Redeploy / restart as Hostinger requires so the Cron process sees the var.

3. **Cron (Sunday 03:17 server time)** — command format:

   **TO CONFIRM IN PHASE 2** — no AB-8C0G Cron proof notes with the exact Hostinger Node binary path were found in-repo. Candidate shape (confirm paths on the live Node app before enabling):

   ```text
   cd /home/u992747032/domains/firestick4uk.com/public_html && /home/u992747032/.nvm/.../node scripts/backup/offsite-db-backup.js
   ```

   Or whatever absolute `node` path hPanel’s Cron UI documents for this Node.js site. Schedule: `17 3 * * 0` (minute 17, hour 3, Sunday) in server local time. Do **not** create the Cron job in PHASE 1.

4. **One manual run** from the app directory with env loaded, then verify Cloudinary private raw folder `firestick4uk-backups` shows one new `f4uk-db-*` object and status lines look sane (sizes, sha256, table counts).

5. **Restore drill** (staging only):

   - Download the `.enc` locally.
   - `node scripts/backup/decrypt-backup.js --in <file.enc> --out restore.sql.gz`
   - Gunzip → import via phpMyAdmin into **`u992747032_f4ukstg13` only** (never production).
   - Compare table row counts to the manifest.
   - Drop the imported staging objects when finished.

## Inert release note

Shipping these files does not change app runtime, SEO, Cron, env, or Cloudinary contents. PHASE 2 is an owner decision.
