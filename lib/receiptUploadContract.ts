/**
 * Shared receipt-upload contract — client help/validation must match server rules.
 * Server byte/MIME sniff remains authoritative for accepted uploads.
 *
 * Empty-MIME normalization (Finding B):
 * Some browsers expose File.type="" and FileReader emits
 * `data:;base64,...` or `data:application/octet-stream;base64,...`.
 * Client prepares the data-URL by sniffing bytes and rewriting the declared MIME
 * to the sniffed allow-listed type before POST. Server parseReceiptDataUrl applies
 * the same rule: empty/octet-stream declared MIME is replaced by sniff ONLY when
 * sniff is an allow-listed type. Filename extension never authorizes acceptance.
 */

export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const RECEIPT_BODY_SIZE_LIMIT = "8mb";

/** Canonical MIME types accepted after normalization + magic sniff. */
export const RECEIPT_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type ReceiptAllowedMime = (typeof RECEIPT_ALLOWED_MIME)[number];

/** HTML accept attribute aligned to the server allow-list (not image/*). */
export const RECEIPT_ACCEPT_ATTR =
  "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf";

/** Declared MIME aliases normalized before allow-list / sniff compare. */
export const RECEIPT_MIME_ALIASES: Record<string, ReceiptAllowedMime> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
};

/** Declared MIME values that mean "browser did not know" — sniff may fill these. */
export const RECEIPT_EMPTY_DECLARED_MIME = new Set(["", "application/octet-stream"]);

const ALLOWED_SET = new Set<string>(RECEIPT_ALLOWED_MIME);

const EXT_TO_MIME: Record<string, ReceiptAllowedMime> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export const RECEIPT_HELP_DEFAULT =
  "JPEG, PNG, WebP or PDF only. Maximum 5 MB. Receipt stays optional — remove the file to place the order without one.";

export function normalizeReceiptMime(mime: string): string {
  const m = String(mime || "")
    .trim()
    .toLowerCase();
  return RECEIPT_MIME_ALIASES[m] || m;
}

export function isAllowedReceiptMime(mime: string): mime is ReceiptAllowedMime {
  return ALLOWED_SET.has(normalizeReceiptMime(mime));
}

export function receiptMimeFromFilename(name: string): ReceiptAllowedMime | null {
  const base = String(name || "")
    .trim()
    .toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot < 0) return null;
  return EXT_TO_MIME[base.slice(dot)] || null;
}

export function sniffReceiptMime(buf: Uint8Array | Buffer): ReceiptAllowedMime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) === "RIFF" &&
    String.fromCharCode(buf[8], buf[9], buf[10], buf[11]) === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    buf.length >= 4 &&
    String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) === "%PDF"
  ) {
    return "application/pdf";
  }
  return null;
}

export type ReceiptClientValidation =
  | { ok: true }
  | { ok: false; code: "unsupported_type" | "file_too_large" | "empty_file" };

/** Pre-submit client guard. Server still re-validates bytes/MIME. */
export function validateReceiptFileClient(file: {
  name?: string;
  type?: string;
  size?: number;
}): ReceiptClientValidation {
  const size = Number(file.size || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, code: "empty_file" };
  }
  if (size > RECEIPT_MAX_BYTES) {
    return { ok: false, code: "file_too_large" };
  }

  const declared = normalizeReceiptMime(String(file.type || ""));
  if (declared && isAllowedReceiptMime(declared)) {
    return { ok: true };
  }

  // Soft client hint only when browser omits type — bytes still decide on upload.
  if (!declared && receiptMimeFromFilename(String(file.name || ""))) {
    return { ok: true };
  }

  return { ok: false, code: "unsupported_type" };
}

export type ReceiptUploadErrorKind =
  | "unsupported_type"
  | "file_too_large"
  | "empty_file"
  | "invalid_file"
  | "rate_limited"
  | "network"
  | "file_read"
  | "gateway"
  | "upload_failed"
  | "server";

const SERVER_ERROR_MAP: Record<string, ReceiptUploadErrorKind> = {
  "Unsupported file type": "unsupported_type",
  "File too large": "file_too_large",
  "Empty file": "empty_file",
  "Invalid file data": "invalid_file",
  "No file provided": "invalid_file",
  "Invalid filename": "invalid_file",
  "Too many upload attempts. Please try again later.": "rate_limited",
  "Upload failed": "upload_failed",
  "Upload path error": "server",
  "Method not allowed": "server",
};

export const RECEIPT_ERROR_DEFAULTS: Record<ReceiptUploadErrorKind, string> = {
  unsupported_type:
    "That file type is not supported. Please upload a JPEG, PNG, WebP or PDF (max 5 MB).",
  file_too_large:
    "That receipt is too large. Please upload a file of 5 MB or less.",
  empty_file: "That receipt file appears empty. Please choose another file.",
  invalid_file:
    "That receipt file could not be read. Please choose a JPEG, PNG, WebP or PDF.",
  rate_limited:
    "Too many upload attempts. Please wait a few minutes and try again.",
  network: "Network error while uploading the receipt. Please check your connection and try again.",
  file_read: "Could not read the selected receipt file. Please choose the file again.",
  gateway:
    "The upload was rejected by the server gateway. Please try a smaller JPEG, PNG, WebP or PDF (max 5 MB).",
  upload_failed: "Payment receipt could not be uploaded. Please try again, or remove the file to continue without a receipt.",
  server: "Payment receipt could not be uploaded. Please try again, or remove the file to continue without a receipt.",
};

export function mapServerReceiptError(message: unknown): ReceiptUploadErrorKind {
  const msg = String(message || "").trim();
  if (SERVER_ERROR_MAP[msg]) return SERVER_ERROR_MAP[msg];
  if (/too large|entity too large|413/i.test(msg)) return "file_too_large";
  if (/unsupported|mime|type/i.test(msg)) return "unsupported_type";
  if (/rate|too many/i.test(msg)) return "rate_limited";
  return "upload_failed";
}

export function classifyReceiptUploadHttpFailure(input: {
  status: number;
  error?: unknown;
  bodyText?: string;
  jsonOk?: boolean;
}): ReceiptUploadErrorKind {
  const { status, error, bodyText, jsonOk } = input;
  if (status === 429) return "rate_limited";
  if (status === 413) return "gateway";
  if (status === 400) return mapServerReceiptError(error);
  if (!jsonOk && status >= 400) {
    if (status === 413 || /entity too large|request entity|413/i.test(String(bodyText || ""))) {
      return "gateway";
    }
    return "gateway";
  }
  if (status >= 500) return "server";
  return mapServerReceiptError(error);
}

export type ParsedReceiptDataUrl =
  | { ok: true; mime: ReceiptAllowedMime; buffer: Buffer; dataUrl: string }
  | { ok: false; error: string };

function decodeBase64Payload(b64: string): Buffer | null {
  try {
    return Buffer.from(b64, "base64");
  } catch {
    return null;
  }
}

/**
 * Resolve declared MIME for a data-URL payload.
 * Empty / octet-stream → sniffed allow-listed MIME only (never filename).
 */
export function resolveReceiptDeclaredMime(
  declaredRaw: string,
  buffer: Buffer
): ReceiptAllowedMime | null {
  const declared = normalizeReceiptMime(declaredRaw);
  const sniffed = sniffReceiptMime(buffer);
  if (!sniffed || !ALLOWED_SET.has(sniffed)) return null;

  if (RECEIPT_EMPTY_DECLARED_MIME.has(declared)) {
    return sniffed;
  }
  if (!isAllowedReceiptMime(declared)) return null;
  if (declared !== sniffed) return null;
  return sniffed;
}

export function parseReceiptDataUrl(file: unknown): ParsedReceiptDataUrl {
  const raw = String(file || "");
  // Allow empty media-type (`data:;base64,...`) and normal `data:mime;base64,...`.
  const m = raw.match(/^data:([^;,]*);base64,(.+)$/i);
  if (!m) return { ok: false, error: "Invalid file data" };

  const buffer = decodeBase64Payload(m[2]);
  if (!buffer) return { ok: false, error: "Invalid file data" };
  if (!buffer.length) return { ok: false, error: "Empty file" };
  if (buffer.length > RECEIPT_MAX_BYTES) return { ok: false, error: "File too large" };

  const mime = resolveReceiptDeclaredMime(m[1], buffer);
  if (!mime) return { ok: false, error: "Unsupported file type" };

  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
  return { ok: true, mime, buffer, dataUrl };
}

/** Client: rewrite FileReader data-URL so empty/octet-stream matches server sniff. */
export function prepareReceiptDataUrlForUpload(fileReaderResult: unknown): ParsedReceiptDataUrl {
  return parseReceiptDataUrl(fileReaderResult);
}
