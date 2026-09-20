/**
 * Phase 6B — one-time idempotent CORE (non-ERP) schema migration.
 *
 * DEFAULT / --check : READ ONLY (print pending actions)
 * --apply           : execute pending actions (requires ALLOW_DB_MUTATION_TESTS)
 *
 * Usage:
 *   node scripts/migrate-core-runtime-schema.js
 *   node scripts/migrate-core-runtime-schema.js --check
 *   node scripts/migrate-core-runtime-schema.js --apply
 */
const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const APPLY = process.argv.includes("--apply");
const MODE = APPLY ? "APPLY" : "CHECK";

/** Copied exactly from pages/api/faqs.ts */
const DEFAULT_FAQS = [
  [
    "How do I place an order?",
    "Browse our products, add items to your cart, fill in your delivery details, choose your payment method (bank transfer or cash on delivery), and click Place Order. You'll receive an Order ID instantly.",
    "Orders & Payment",
    1,
  ],
  [
    "What payment methods do you accept?",
    "We accept UK bank transfer and cash on delivery. For bank transfer, our account details are shown at checkout. Simply transfer the amount and upload your receipt. Subscription services are active within 1 hour of payment confirmation.",
    "Orders & Payment",
    2,
  ],
  [
    "How do I pay by bank transfer?",
    "At checkout, select Bank Transfer. Our UK bank account details will be displayed. Transfer the exact amount using the Order ID as your reference, then upload a screenshot of your receipt. We'll verify and confirm your order shortly.",
    "Orders & Payment",
    3,
  ],
  [
    "Is cash on delivery available?",
    "Yes! Cash on delivery is available for physical products (Firestick and Android Boxes) delivered across the UK. Simply select this option at checkout.",
    "Orders & Payment",
    4,
  ],
  [
    "Can I cancel my order?",
    "You can cancel your order before it has been dispatched. Please contact us via WhatsApp (+447518787653) or Telegram (@firestick44) with your Order ID as soon as possible. Once dispatched, cancellations are not possible but you may be eligible for a return.",
    "Orders & Payment",
    5,
  ],
  [
    "How long does delivery take?",
    "Physical items (Firestick and Android Boxes) are delivered within 2-3 working days across the UK. Subscription plans are active within 1 hour of payment confirmation.",
    "Delivery & Shipping",
    1,
  ],
  [
    "Do you deliver across the whole UK?",
    "Yes, we deliver to all mainland UK addresses. For remote locations such as Scottish Highlands or islands, delivery may take an extra 1-2 days.",
    "Delivery & Shipping",
    2,
  ],
  [
    "How much does shipping cost?",
    "Shipping is free on subscription plans. For physical products, a standard shipping fee of £3.99 applies unless otherwise stated at checkout.",
    "Delivery & Shipping",
    3,
  ],
  [
    "How do I track my order?",
    "Once your order is confirmed, use your Order ID on our Order Tracking page to check real-time status — from confirmation through to delivery.",
    "Delivery & Shipping",
    4,
  ],
  [
    "Do Firesticks come pre-configured?",
    "Yes! Our Firestick devices are pre-configured and ready to use straight out of the box. Simply plug in, connect to your Wi-Fi, and you're good to go.",
    "Products & Setup",
    1,
  ],
  [
    "What is a subscription plan?",
    "Our subscription plans give you access to premium content through compatible apps on your device. One connection is included per subscription.",
    "Products & Setup",
    2,
  ],
  [
    "Which devices are compatible with the subscription plans?",
    "Works on Firestick (all generations), Android box, Smart TV (Samsung/LG), iPhone, Android phone/tablet, Roku and Windows.",
    "Products & Setup",
    3,
  ],
  [
    "What if my device stops working?",
    "Please try using a VPN or switching to mobile hotspot. Some ISPs may affect streaming performance. If you still need help, contact us via WhatsApp (+447518787653) or Telegram (@firestick44).",
    "Products & Setup",
    4,
  ],
  [
    "What is your refund policy?",
    "No free trials. We offer a 7-day money back guarantee on 1 Year plans and above only. Physical product returns are handled separately under our Refund Policy.",
    "Returns & Refunds",
    1,
  ],
  [
    "How do I return an item?",
    "Contact us via WhatsApp (+447518787653), Telegram (@firestick44) or email with your Order ID and reason for return. We'll guide you through the process. Return postage costs are the responsibility of the customer unless the item is faulty.",
    "Returns & Refunds",
    2,
  ],
  [
    "What if I received a faulty item?",
    "We're sorry to hear that! Please contact us immediately via WhatsApp (+447518787653) or Telegram (@firestick44) with photos of the fault. We'll arrange a replacement or full refund at no extra cost to you.",
    "Returns & Refunds",
    3,
  ],
];

/** Copied exactly from pages/api/faqs.ts */
const REQUIRED_FAQS = [
  [
    "Do you offer free trials?",
    "No free trials. We offer a 7-day money back guarantee on 1 Year plans and above.",
    "Policies",
    1,
  ],
  [
    "What devices does it work on?",
    "Works on Firestick, Android box, Smart TV (Samsung/LG), iPhone, Android phone, Roku and Windows.",
    "Products & Setup",
    5,
  ],
  [
    "How long to activate?",
    "Your service will be active within 1 hour of payment confirmation.",
    "Delivery & Shipping",
    5,
  ],
  [
    "Can I use it on 2 devices simultaneously?",
    "One connection at a time per subscription. For simultaneous use on 2 devices, you need 2 separate subscriptions.",
    "Policies",
    2,
  ],
  [
    "My service is buffering/not working?",
    "Please try using a VPN or switching to mobile hotspot. Some ISPs may affect streaming performance.",
    "Technical Support",
    1,
  ],
  [
    "Does it work outside UK?",
    "Yes, the service is available outside UK but we cannot guarantee performance due to regional restrictions.",
    "Policies",
    3,
  ],
];

const SECTION_KEYS = [
  "home_hero",
  "home_featured_products",
  "home_features",
  "home_testimonials",
  "home_newsletter",
  "about_hero",
  "about_mission",
  "about_values",
];

const SITE_CONTENT_IPTV_REPLACEMENTS = [
  ["Premium IPTV & Streaming", "Premium Streaming"],
  ["IPTV & Streaming Solutions", "Streaming Solutions"],
  ["Premium IPTV", "Premium Streaming"],
  ["IPTV", "Streaming"],
  ["iptv", "streaming"],
];

const SECTION_IPTV_REPLACEMENTS = [
  ["Premium IPTV & Streaming", "Premium Streaming"],
  ["IPTV & Streaming Solutions", "Streaming Solutions"],
  ["Premium IPTV", "Premium Streaming"],
  ["IPTV", "Streaming"],
];

const BLOG_IPTV_REPLACEMENTS = [
  ["Premium IPTV & Streaming", "Premium Streaming"],
  ["IPTV & Streaming Solutions", "Streaming Solutions"],
  ["Premium IPTV", "Premium Streaming"],
  ["Best IPTV", "Best Streaming"],
  ["IPTV Subscriptions", "Streaming Subscriptions"],
  ["IPTV service", "streaming service"],
  ["IPTV Plans", "Streaming Plans"],
  ["IPTV", "Streaming"],
  ["iptv", "streaming"],
];

const PRODUCT_COLUMNS = [
  ["short_description", "TEXT"],
  ["full_description", "TEXT"],
  ["seo_title", "VARCHAR(60)"],
  ["meta_description", "VARCHAR(160)"],
  ["focus_keyword", "VARCHAR(100)"],
  ["features", "TEXT"],
  ["og_image", "VARCHAR(500)"],
  ["slug", "VARCHAR(255)"],
];

const ORDER_COLUMNS = [
  ["coupon_code", "VARCHAR(50)"],
  ["discount_amount", "DECIMAL(10,2) DEFAULT 0"],
  ["vat_amount", "DECIMAL(10,2) DEFAULT 0"],
  ["payment_reference", "VARCHAR(255)"],
];

const BLOG_ADD_COLUMNS = [
  ["slug", "VARCHAR(500)"],
  ["content", "LONGTEXT"],
  ["featured_image", "VARCHAR(1000)"],
  ["meta_title", "VARCHAR(500)"],
  ["meta_description", "VARCHAR(500)"],
  ["focus_keyword", "VARCHAR(255)"],
  ["status", "VARCHAR(20) DEFAULT 'published'"],
  ["featured", "TINYINT(1) DEFAULT 0"],
  ["canonical_url", "VARCHAR(500)"],
  ["faqs", "TEXT"],
  ["active", "TINYINT(1) DEFAULT 1"],
  ["badgeText", "VARCHAR(50) DEFAULT 'Guide'"],
  ["emoji", "VARCHAR(10) DEFAULT '📝'"],
];

function loadSiteContentSeeds() {
  const ts = require("typescript");
  const tmpDir = path.join(__dirname, "..", ".tmp-migrate-seeds");
  fs.mkdirSync(tmpDir, { recursive: true });

  for (const name of ["siteContentDefaults", "siteContentSeed"]) {
    const src = fs.readFileSync(path.join(__dirname, `../lib/${name}.ts`), "utf8");
    let { outputText } = ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    });
    outputText = outputText.replace(/require\("\.\/([^"]+)"\)/g, 'require("./$1.js")');
    fs.writeFileSync(path.join(tmpDir, `${name}.js`), outputText);
  }

  // Clear require cache so re-runs pick up fresh transpile
  const seedPath = path.join(tmpDir, "siteContentSeed.js");
  const defaultsPath = path.join(tmpDir, "siteContentDefaults.js");
  delete require.cache[require.resolve(seedPath)];
  delete require.cache[require.resolve(defaultsPath)];
  return require(seedPath);
}

async function tableExists(db, schema, table) {
  const [rows] = await db.query(
    `SELECT 1 AS ok FROM information_schema.tables
     WHERE table_schema = ? AND table_name = ? LIMIT 1`,
    [schema, table]
  );
  return rows.length > 0;
}

async function columnExists(db, schema, table, column) {
  const [rows] = await db.query(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1`,
    [schema, table, column]
  );
  return rows.length > 0;
}

async function indexExists(db, schema, table, indexName) {
  const [rows] = await db.query(
    `SELECT 1 AS ok FROM information_schema.statistics
     WHERE table_schema = ? AND table_name = ? AND index_name = ? LIMIT 1`,
    [schema, table, indexName]
  );
  return rows.length > 0;
}

async function getColumnType(db, schema, table, column) {
  const [rows] = await db.query(
    `SELECT COLUMN_TYPE AS ct FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1`,
    [schema, table, column]
  );
  return rows[0]?.ct ? String(rows[0].ct) : null;
}

async function scalarCount(db, sql, params = []) {
  const [rows] = await db.query(sql, params);
  return Number(rows[0]?.c || 0);
}

function action(category, description, run) {
  return { category, description, run };
}

async function collectPending(db, schema, seeds) {
  const pending = [];
  const { SITE_CONTENT_DEFAULTS, SECTION_DEFAULTS } = seeds;

  // ── admin_sessions ───────────────────────────────────────────────────────
  if (!(await tableExists(db, schema, "admin_sessions"))) {
    pending.push(
      action("admin_sessions", "CREATE TABLE admin_sessions", async (conn) => {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS admin_sessions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            token_hash VARCHAR(64) NOT NULL,
            staff_id INT NULL,
            principal_type ENUM('master','staff') NOT NULL,
            principal_name VARCHAR(255) NOT NULL,
            role ENUM('super_admin','manager','writer') NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_seen_at DATETIME NULL,
            ip_address VARCHAR(64) NULL,
            user_agent VARCHAR(512) NULL,
            UNIQUE KEY uniq_admin_session_token (token_hash),
            KEY idx_admin_session_expires (expires_at),
            KEY idx_admin_session_staff (staff_id)
          )
        `);
      })
    );
  } else {
    const sessionCols = [
      ["token_hash", "VARCHAR(64) NOT NULL"],
      ["staff_id", "INT NULL"],
      ["principal_type", "ENUM('master','staff') NOT NULL"],
      ["principal_name", "VARCHAR(255) NOT NULL"],
      ["role", "ENUM('super_admin','manager','writer') NOT NULL"],
      ["expires_at", "DATETIME NOT NULL"],
      ["created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
      ["last_seen_at", "DATETIME NULL"],
      ["ip_address", "VARCHAR(64) NULL"],
      ["user_agent", "VARCHAR(512) NULL"],
    ];
    for (const [col, def] of sessionCols) {
      if (!(await columnExists(db, schema, "admin_sessions", col))) {
        pending.push(
          action("admin_sessions", `ADD COLUMN admin_sessions.${col}`, async (conn) => {
            await conn.query(`ALTER TABLE admin_sessions ADD COLUMN ${col} ${def}`);
          })
        );
      }
    }
    for (const [idx, ddl] of [
      ["uniq_admin_session_token", "UNIQUE KEY uniq_admin_session_token (token_hash)"],
      ["idx_admin_session_expires", "KEY idx_admin_session_expires (expires_at)"],
      ["idx_admin_session_staff", "KEY idx_admin_session_staff (staff_id)"],
    ]) {
      if (!(await indexExists(db, schema, "admin_sessions", idx))) {
        pending.push(
          action("admin_sessions", `ADD INDEX admin_sessions.${idx}`, async (conn) => {
            await conn.query(`ALTER TABLE admin_sessions ADD ${ddl}`);
          })
        );
      }
    }
  }

  // ── admin_staff ──────────────────────────────────────────────────────────
  if (!(await tableExists(db, schema, "admin_staff"))) {
    pending.push(
      action("admin_staff", "CREATE TABLE admin_staff", async (conn) => {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS admin_staff (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role ENUM('super_admin','manager','writer') DEFAULT 'writer',
            active TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login_at DATETIME NULL,
            password_changed_at DATETIME NULL,
            updated_at DATETIME NULL
          )
        `);
      })
    );
  } else {
    for (const [col, def] of [
      ["last_login_at", "DATETIME NULL"],
      ["password_changed_at", "DATETIME NULL"],
      ["updated_at", "DATETIME NULL"],
    ]) {
      if (!(await columnExists(db, schema, "admin_staff", col))) {
        pending.push(
          action("admin_staff", `ADD COLUMN admin_staff.${col}`, async (conn) => {
            await conn.query(`ALTER TABLE admin_staff ADD COLUMN ${col} ${def}`);
          })
        );
      }
    }
  }

  // ── site_content ─────────────────────────────────────────────────────────
  const siteContentExists = await tableExists(db, schema, "site_content");
  if (!siteContentExists) {
    pending.push(
      action("site_content", "CREATE TABLE site_content", async (conn) => {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS site_content (
            id INT AUTO_INCREMENT PRIMARY KEY,
            content_key VARCHAR(100) UNIQUE NOT NULL,
            content_value TEXT,
            content_type ENUM('text','textarea','image','url','json') DEFAULT 'text',
            page_name VARCHAR(50),
            label VARCHAR(100),
            section_order INT DEFAULT 0,
            is_visible TINYINT(1) DEFAULT 1,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          )
        `);
      })
    );
  } else {
    if (!(await columnExists(db, schema, "site_content", "section_order"))) {
      pending.push(
        action("site_content", "ADD COLUMN site_content.section_order", async (conn) => {
          await conn.query("ALTER TABLE site_content ADD COLUMN section_order INT DEFAULT 0");
        })
      );
    }
    if (!(await columnExists(db, schema, "site_content", "is_visible"))) {
      pending.push(
        action("site_content", "ADD COLUMN site_content.is_visible", async (conn) => {
          await conn.query("ALTER TABLE site_content ADD COLUMN is_visible TINYINT(1) DEFAULT 1");
        })
      );
    }
    const ct = await getColumnType(db, schema, "site_content", "content_type");
    if (ct && !/\bjson\b/i.test(ct)) {
      pending.push(
        action("site_content", "MODIFY content_type ENUM to include json", async (conn) => {
          await conn.query(
            "ALTER TABLE site_content MODIFY COLUMN content_type ENUM('text','textarea','image','url','json') DEFAULT 'text'"
          );
        })
      );
    }
  }

  // Seeds — SITE_CONTENT_DEFAULTS
  if (!siteContentExists) {
    for (const [key, val, type, page, label] of SITE_CONTENT_DEFAULTS) {
      pending.push(
        action("site_content_seed", `INSERT IGNORE site_content key=${key}`, async (conn) => {
          await conn.query(
            "INSERT IGNORE INTO site_content (content_key, content_value, content_type, page_name, label) VALUES (?,?,?,?,?)",
            [key, val, type, page, label]
          );
        })
      );
    }
    for (const [key, val, type, page, label, order, vis] of SECTION_DEFAULTS) {
      pending.push(
        action("site_content_seed", `INSERT IGNORE section key=${key}`, async (conn) => {
          await conn.query(
            "INSERT IGNORE INTO site_content (content_key,content_value,content_type,page_name,label,section_order,is_visible) VALUES (?,?,?,?,?,?,?)",
            [key, val, type, page, label, order, vis]
          );
        })
      );
    }
  } else {
    const [existingRows] = await db.query("SELECT content_key FROM site_content");
    const existing = new Set(existingRows.map((r) => r.content_key));
    for (const [key, val, type, page, label] of SITE_CONTENT_DEFAULTS) {
      if (!existing.has(key)) {
        pending.push(
          action("site_content_seed", `INSERT IGNORE site_content key=${key}`, async (conn) => {
            await conn.query(
              "INSERT IGNORE INTO site_content (content_key, content_value, content_type, page_name, label) VALUES (?,?,?,?,?)",
              [key, val, type, page, label]
            );
          })
        );
      }
    }
    for (const [key, val, type, page, label, order, vis] of SECTION_DEFAULTS) {
      if (!existing.has(key)) {
        pending.push(
          action("site_content_seed", `INSERT IGNORE section key=${key}`, async (conn) => {
            await conn.query(
              "INSERT IGNORE INTO site_content (content_key,content_value,content_type,page_name,label,section_order,is_visible) VALUES (?,?,?,?,?,?,?)",
              [key, val, type, page, label, order, vis]
            );
          })
        );
      }
    }
  }

  // Legacy site_content data migrations (only when table exists and condition matches)
  if (siteContentExists) {
    if (
      (await scalarCount(
        db,
        "SELECT COUNT(*) AS c FROM site_content WHERE content_key IN ('whatsapp_number','contact_whatsapp') AND content_value LIKE '%447934519060%'"
      )) > 0
    ) {
      pending.push(
        action(
          "site_content_data",
          "Replace old WhatsApp number on whatsapp_number/contact_whatsapp",
          async (conn) => {
            await conn.query(
              "UPDATE site_content SET content_value='447518787653', page_name='settings', label='WhatsApp Number' WHERE content_key IN ('whatsapp_number','contact_whatsapp') AND content_value LIKE '%447934519060%'"
            );
          }
        )
      );
    }
    if (
      (await scalarCount(
        db,
        "SELECT COUNT(*) AS c FROM site_content WHERE content_value LIKE '%447934519060%'"
      )) > 0
    ) {
      pending.push(
        action("site_content_data", "REPLACE 447934519060 → 447518787653 in content_value", async (conn) => {
          await conn.query(
            "UPDATE site_content SET content_value=REPLACE(content_value,'447934519060','447518787653') WHERE content_value LIKE '%447934519060%'"
          );
        })
      );
    }
    if (
      (await scalarCount(
        db,
        "SELECT COUNT(*) AS c FROM site_content WHERE content_value LIKE '%7934 519060%'"
      )) > 0
    ) {
      pending.push(
        action("site_content_data", "REPLACE +44 7934 519060 → +447518787653", async (conn) => {
          await conn.query(
            "UPDATE site_content SET content_value=REPLACE(content_value,'+44 7934 519060','+447518787653') WHERE content_value LIKE '%7934 519060%'"
          );
        })
      );
    }
    if (
      (await scalarCount(
        db,
        "SELECT COUNT(*) AS c FROM site_content WHERE content_key='contact_phone' AND (content_value LIKE '%7934%519060%' OR content_value LIKE '%447934519060%')"
      )) > 0
    ) {
      pending.push(
        action("site_content_data", "Fix contact_phone value/page/label for old number", async (conn) => {
          await conn.query(
            "UPDATE site_content SET content_value='+447518787653', page_name='settings', label='Phone Number' WHERE content_key='contact_phone' AND (content_value LIKE '%7934%519060%' OR content_value LIKE '%447934519060%')"
          );
        })
      );
    }
    if (
      (await scalarCount(
        db,
        "SELECT COUNT(*) AS c FROM site_content WHERE content_key='contact_whatsapp' AND (IFNULL(page_name,'')<>'settings' OR IFNULL(label,'')<>'WhatsApp Number')"
      )) > 0
    ) {
      pending.push(
        action("site_content_data", "Fix page_name/label for contact_whatsapp", async (conn) => {
          await conn.query(
            "UPDATE site_content SET page_name='settings', label='WhatsApp Number' WHERE content_key='contact_whatsapp'"
          );
        })
      );
    }
    if (
      (await scalarCount(
        db,
        "SELECT COUNT(*) AS c FROM site_content WHERE content_key='contact_phone' AND (IFNULL(page_name,'')<>'settings' OR IFNULL(label,'')<>'Phone Number')"
      )) > 0
    ) {
      pending.push(
        action("site_content_data", "Fix page_name/label for contact_phone", async (conn) => {
          await conn.query(
            "UPDATE site_content SET page_name='settings', label='Phone Number' WHERE content_key='contact_phone'"
          );
        })
      );
    }
    if (
      (await scalarCount(
        db,
        "SELECT COUNT(*) AS c FROM site_content WHERE content_key='contact_email' AND (IFNULL(page_name,'')<>'settings' OR IFNULL(label,'')<>'Contact Email')"
      )) > 0
    ) {
      pending.push(
        action("site_content_data", "Fix page_name/label for contact_email", async (conn) => {
          await conn.query(
            "UPDATE site_content SET page_name='settings', label='Contact Email' WHERE content_key='contact_email'"
          );
        })
      );
    }
    if (
      (await scalarCount(
        db,
        `SELECT COUNT(*) AS c FROM site_content wa
         INNER JOIN site_content cw ON cw.content_key='contact_whatsapp'
         WHERE wa.content_key='whatsapp_number'
           AND IFNULL(wa.content_value,'') <> IFNULL(cw.content_value,'')`
      )) > 0
    ) {
      pending.push(
        action("site_content_data", "Sync whatsapp_number from contact_whatsapp", async (conn) => {
          await conn.query(
            `UPDATE site_content wa
             INNER JOIN site_content cw ON cw.content_key='contact_whatsapp'
             SET wa.content_value = cw.content_value
             WHERE wa.content_key='whatsapp_number'`
          );
        })
      );
    }

    for (const [from, to] of SITE_CONTENT_IPTV_REPLACEMENTS) {
      const c = await scalarCount(
        db,
        `SELECT COUNT(*) AS c FROM site_content
         WHERE content_value LIKE ?
           AND content_key NOT LIKE 'subscription_%'
           AND content_key <> 'nav_subscription_label'`,
        [`%${from}%`]
      );
      if (c > 0) {
        pending.push(
          action(
            "site_content_data",
            `IPTV→Streaming REPLACE '${from}' → '${to}' (${c} rows)`,
            async (conn) => {
              await conn.query(
                `UPDATE site_content
                 SET content_value = REPLACE(content_value, ?, ?)
                 WHERE content_value LIKE ?
                   AND content_key NOT LIKE 'subscription_%'
                   AND content_key <> 'nav_subscription_label'`,
                [from, to, `%${from}%`]
              );
            }
          )
        );
      }
    }

    for (const [key, label] of [
      ["home_top_hero_title", "Top Hero Title"],
      ["home_top_hero_subtitle", "Top Hero Subtitle"],
      ["home_hero_title", "Main Hero Title"],
      ["home_hero_subtitle", "Main Hero Subtitle"],
    ]) {
      if (
        (await scalarCount(
          db,
          "SELECT COUNT(*) AS c FROM site_content WHERE content_key=? AND IFNULL(label,'')<>?",
          [key, label]
        )) > 0
      ) {
        pending.push(
          action("site_content_data", `Sync label for ${key} → '${label}'`, async (conn) => {
            await conn.query("UPDATE site_content SET label=? WHERE content_key=?", [label, key]);
          })
        );
      }
    }

    const emptyTypeCount = await scalarCount(
      db,
      `SELECT COUNT(*) AS c FROM site_content
       WHERE content_key IN (${SECTION_KEYS.map(() => "?").join(",")})
         AND (content_type='' OR content_type IS NULL)`,
      SECTION_KEYS
    );
    if (emptyTypeCount > 0) {
      pending.push(
        action("site_content_data", "Fix empty content_type for section keys → json", async (conn) => {
          await conn.query(
            `UPDATE site_content SET content_type='json'
             WHERE content_key IN (${SECTION_KEYS.map(() => "?").join(",")})
               AND (content_type='' OR content_type IS NULL)`,
            SECTION_KEYS
          );
        })
      );
    }

    for (const [from, to] of SECTION_IPTV_REPLACEMENTS) {
      const c = await scalarCount(
        db,
        `SELECT COUNT(*) AS c FROM site_content
         WHERE content_type='json'
           AND content_value LIKE ?
           AND content_key NOT LIKE 'subscription_%'`,
        [`%${from}%`]
      );
      if (c > 0) {
        pending.push(
          action(
            "site_content_data",
            `JSON section IPTV→Streaming '${from}' → '${to}' (${c} rows)`,
            async (conn) => {
              await conn.query(
                `UPDATE site_content SET content_value = REPLACE(content_value, ?, ?)
                 WHERE content_type='json'
                   AND content_value LIKE ?
                   AND content_key NOT LIKE 'subscription_%'`,
                [from, to, `%${from}%`]
              );
            }
          )
        );
      }
    }
  }

  // ── products ─────────────────────────────────────────────────────────────
  if (await tableExists(db, schema, "products")) {
    for (const [col, def] of PRODUCT_COLUMNS) {
      if (!(await columnExists(db, schema, "products", col))) {
        pending.push(
          action("products", `ADD COLUMN products.${col}`, async (conn) => {
            await conn.query(`ALTER TABLE products ADD COLUMN ${col} ${def}`);
          })
        );
      }
    }

    const hasSlug = await columnExists(db, schema, "products", "slug");
    let emptySlugs = 0;
    if (hasSlug) {
      emptySlugs = await scalarCount(
        db,
        "SELECT COUNT(*) AS c FROM products WHERE slug IS NULL OR slug = ''"
      );
    } else {
      // Column will be added above; all existing rows will have NULL slug
      emptySlugs = await scalarCount(db, "SELECT COUNT(*) AS c FROM products");
    }

    if (emptySlugs > 0) {
      pending.push(
        action("products", `Backfill empty product slugs (${emptySlugs} rows)`, async (conn) => {
          await conn.query(
            `UPDATE products
             SET slug = LOWER(REPLACE(REPLACE(REPLACE(name, ' ', '-'), '/', ''), '--', '-'))
             WHERE slug IS NULL OR slug = ''`
          );
          await conn.query(
            `UPDATE products
             SET slug = TRIM(BOTH '-' FROM slug)
             WHERE slug IS NOT NULL`
          );
        })
      );
    }

    let dupCount = 0;
    if (hasSlug) {
      const [dupRows] = await db.query(
        `SELECT slug, GROUP_CONCAT(id ORDER BY id) AS ids, COUNT(*) AS c
         FROM products
         WHERE slug IS NOT NULL AND slug != ''
         GROUP BY slug
         HAVING c > 1`
      );
      dupCount = dupRows.length;
    }

    // Always queue dup-repair when backfilling (new collisions possible) or dups exist
    if (dupCount > 0 || emptySlugs > 0) {
      pending.push(
        action(
          "products",
          dupCount > 0
            ? `Repair duplicate product slugs (${dupCount} groups)`
            : "Repair duplicate product slugs (post-backfill check)",
          async (conn) => {
            const [rows] = await conn.query(
              `SELECT slug, GROUP_CONCAT(id ORDER BY id) AS ids, COUNT(*) AS c
               FROM products
               WHERE slug IS NOT NULL AND slug != ''
               GROUP BY slug
               HAVING c > 1`
            );
            for (const row of rows) {
              const ids = String(row.ids || "")
                .split(",")
                .map((id) => Number(id))
                .filter(Boolean);
              for (const id of ids.slice(1)) {
                await conn.query("UPDATE products SET slug = ? WHERE id = ?", [`${row.slug}-${id}`, id]);
              }
            }
          }
        )
      );
    }

    if (!(await indexExists(db, schema, "products", "unique_slug"))) {
      pending.push(
        action("products", "ADD UNIQUE KEY unique_slug (slug)", async (conn) => {
          await conn.query("ALTER TABLE products ADD UNIQUE KEY unique_slug (slug)");
        })
      );
    }
  }

  // ── orders ───────────────────────────────────────────────────────────────
  if (await tableExists(db, schema, "orders")) {
    for (const [col, def] of ORDER_COLUMNS) {
      if (!(await columnExists(db, schema, "orders", col))) {
        pending.push(
          action("orders", `ADD COLUMN orders.${col}`, async (conn) => {
            await conn.query(`ALTER TABLE orders ADD COLUMN ${col} ${def}`);
          })
        );
      }
    }
  }

  // ── blog_posts ───────────────────────────────────────────────────────────
  const blogExists = await tableExists(db, schema, "blog_posts");
  if (!blogExists) {
    pending.push(
      action("blog_posts", "CREATE TABLE blog_posts", async (conn) => {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS blog_posts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(500) NOT NULL,
            slug VARCHAR(500),
            excerpt TEXT,
            content LONGTEXT,
            category VARCHAR(100) DEFAULT 'Guides',
            emoji VARCHAR(10) DEFAULT '📝',
            badge VARCHAR(50) DEFAULT 'guide',
            badgeText VARCHAR(50) DEFAULT 'Guide',
            featured_image VARCHAR(1000),
            meta_title VARCHAR(500),
            meta_description VARCHAR(500),
            focus_keyword VARCHAR(255),
            status VARCHAR(20) DEFAULT 'published',
            featured TINYINT(1) DEFAULT 0,
            active TINYINT(1) DEFAULT 1,
            canonical_url VARCHAR(500),
            faqs TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
      })
    );
  } else {
    for (const [col, def] of BLOG_ADD_COLUMNS) {
      if (!(await columnExists(db, schema, "blog_posts", col))) {
        pending.push(
          action("blog_posts", `ADD COLUMN blog_posts.${col}`, async (conn) => {
            await conn.query(`ALTER TABLE blog_posts ADD COLUMN ${col} ${def}`);
          })
        );
      }
    }

    if (await columnExists(db, schema, "blog_posts", "active")) {
      const nullActive = await scalarCount(db, "SELECT COUNT(*) AS c FROM blog_posts WHERE active IS NULL");
      if (nullActive > 0) {
        pending.push(
          action("blog_posts", `UPDATE active=1 WHERE active IS NULL (${nullActive} rows)`, async (conn) => {
            await conn.query("UPDATE blog_posts SET active=1 WHERE active IS NULL");
          })
        );
      }
    }

    for (const [from, to] of BLOG_IPTV_REPLACEMENTS) {
      const c = await scalarCount(
        db,
        `SELECT COUNT(*) AS c FROM blog_posts
         WHERE title LIKE ? OR excerpt LIKE ? OR content LIKE ?
            OR IFNULL(meta_title,'') LIKE ? OR IFNULL(meta_description,'') LIKE ?`,
        [`%${from}%`, `%${from}%`, `%${from}%`, `%${from}%`, `%${from}%`]
      );
      if (c > 0) {
        pending.push(
          action("blog_posts", `IPTV→Streaming blog REPLACE '${from}' → '${to}' (${c} rows)`, async (conn) => {
            await conn.query(
              `UPDATE blog_posts SET
                 title = REPLACE(title, ?, ?),
                 excerpt = REPLACE(excerpt, ?, ?),
                 content = REPLACE(content, ?, ?),
                 meta_title = REPLACE(IFNULL(meta_title,''), ?, ?),
                 meta_description = REPLACE(IFNULL(meta_description,''), ?, ?)
               WHERE title LIKE ? OR excerpt LIKE ? OR content LIKE ?
                  OR IFNULL(meta_title,'') LIKE ? OR IFNULL(meta_description,'') LIKE ?`,
              [
                from,
                to,
                from,
                to,
                from,
                to,
                from,
                to,
                from,
                to,
                `%${from}%`,
                `%${from}%`,
                `%${from}%`,
                `%${from}%`,
                `%${from}%`,
              ]
            );
          })
        );
      }
    }
  }

  // ── faqs ─────────────────────────────────────────────────────────────────
  const faqsExists = await tableExists(db, schema, "faqs");
  if (!faqsExists) {
    pending.push(
      action("faqs", "CREATE TABLE faqs", async (conn) => {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS faqs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            category VARCHAR(100) DEFAULT 'General',
            sort_order INT DEFAULT 0,
            is_visible TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
      })
    );
    for (const [q, a, cat, ord] of DEFAULT_FAQS) {
      pending.push(
        action("faqs", `INSERT DEFAULT_FAQ: ${q.slice(0, 48)}`, async (conn) => {
          await conn.query("INSERT INTO faqs (question,answer,category,sort_order) VALUES (?,?,?,?)", [
            q,
            a,
            cat,
            ord,
          ]);
        })
      );
    }
    for (const [q, a, cat, ord] of REQUIRED_FAQS) {
      pending.push(
        action("faqs", `INSERT REQUIRED_FAQ: ${q.slice(0, 48)}`, async (conn) => {
          const [rows] = await conn.query("SELECT id FROM faqs WHERE question=? LIMIT 1", [q]);
          if (!rows.length) {
            await conn.query("INSERT INTO faqs (question,answer,category,sort_order) VALUES (?,?,?,?)", [
              q,
              a,
              cat,
              ord,
            ]);
          }
        })
      );
    }
  } else {
    const faqCount = await scalarCount(db, "SELECT COUNT(*) AS c FROM faqs");
    if (faqCount === 0) {
      for (const [q, a, cat, ord] of DEFAULT_FAQS) {
        pending.push(
          action("faqs", `INSERT DEFAULT_FAQ: ${q.slice(0, 48)}`, async (conn) => {
            await conn.query("INSERT INTO faqs (question,answer,category,sort_order) VALUES (?,?,?,?)", [
              q,
              a,
              cat,
              ord,
            ]);
          })
        );
      }
    }
    for (const [q, a, cat, ord] of REQUIRED_FAQS) {
      const exists = await scalarCount(db, "SELECT COUNT(*) AS c FROM faqs WHERE question=? LIMIT 1", [q]);
      if (exists === 0) {
        pending.push(
          action("faqs", `INSERT REQUIRED_FAQ: ${q.slice(0, 48)}`, async (conn) => {
            const [rows] = await conn.query("SELECT id FROM faqs WHERE question=? LIMIT 1", [q]);
            if (!rows.length) {
              await conn.query("INSERT INTO faqs (question,answer,category,sort_order) VALUES (?,?,?,?)", [
                q,
                a,
                cat,
                ord,
              ]);
            }
          })
        );
      }
    }
  }

  // ── coupons ──────────────────────────────────────────────────────────────
  const couponsExists = await tableExists(db, schema, "coupons");
  if (!couponsExists) {
    pending.push(
      action("coupons", "CREATE TABLE coupons", async (conn) => {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS coupons (
            id INT AUTO_INCREMENT PRIMARY KEY,
            code VARCHAR(50) UNIQUE NOT NULL,
            type ENUM('percentage','fixed') NOT NULL,
            value DECIMAL(10,2) NOT NULL,
            minimum_order DECIMAL(10,2) DEFAULT 0,
            usage_limit INT DEFAULT NULL,
            used_count INT DEFAULT 0,
            expires_at DATE DEFAULT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
      })
    );
    pending.push(
      action("coupons", "INSERT IGNORE WELCOME10 and SAVE5", async (conn) => {
        await conn.query(
          "INSERT IGNORE INTO coupons (code,type,value,minimum_order) VALUES ('WELCOME10','percentage',10,0),('SAVE5','fixed',5,20)"
        );
      })
    );
  } else {
    const welcome = await scalarCount(db, "SELECT COUNT(*) AS c FROM coupons WHERE code='WELCOME10'");
    const save5 = await scalarCount(db, "SELECT COUNT(*) AS c FROM coupons WHERE code='SAVE5'");
    if (welcome === 0 || save5 === 0) {
      pending.push(
        action("coupons", "INSERT IGNORE WELCOME10 and SAVE5", async (conn) => {
          await conn.query(
            "INSERT IGNORE INTO coupons (code,type,value,minimum_order) VALUES ('WELCOME10','percentage',10,0),('SAVE5','fixed',5,20)"
          );
        })
      );
    }
  }

  // ── contact_messages ─────────────────────────────────────────────────────
  if (!(await tableExists(db, schema, "contact_messages"))) {
    pending.push(
      action("contact_messages", "CREATE TABLE contact_messages", async (conn) => {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS contact_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255),
            email VARCHAR(255),
            phone VARCHAR(50),
            subject VARCHAR(255),
            message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
      })
    );
  }

  // ── chat_leads ───────────────────────────────────────────────────────────
  if (!(await tableExists(db, schema, "chat_leads"))) {
    pending.push(
      action("chat_leads", "CREATE TABLE chat_leads", async (conn) => {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS chat_leads (
            id INT AUTO_INCREMENT PRIMARY KEY,
            customer_name VARCHAR(255),
            customer_whatsapp VARCHAR(50),
            customer_email VARCHAR(255),
            interested_in VARCHAR(255),
            chat_history TEXT,
            ip_address VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
      })
    );
  }

  // ── berlin_training ──────────────────────────────────────────────────────
  if (!(await tableExists(db, schema, "berlin_training"))) {
    pending.push(
      action("berlin_training", "CREATE TABLE berlin_training", async (conn) => {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS berlin_training (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            content TEXT NOT NULL,
            is_active TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          )
        `);
      })
    );
  }

  // ── berlin_training_chat_messages ────────────────────────────────────────
  if (!(await tableExists(db, schema, "berlin_training_chat_messages"))) {
    pending.push(
      action("berlin_training_chat_messages", "CREATE TABLE berlin_training_chat_messages", async (conn) => {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS berlin_training_chat_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            role ENUM('user','assistant') NOT NULL,
            content TEXT NOT NULL,
            saved_training_title VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
      })
    );
  }

  return pending;
}

async function main() {
  loadEnvLocal();

  if (APPLY) {
    require("./testMutationGuard").requireMutationOptIn("migrate-core-runtime-schema");
  }

  const mysql = require("mysql2/promise");
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;
  const port = Number(process.env.DB_PORT) || 3306;

  if (!host || !user || !password || !database) {
    console.error("FAIL: Missing DB_HOST / DB_USER / DB_PASSWORD / DB_NAME");
    process.exit(1);
  }

  console.log(`Mode: ${MODE}`);
  console.log(`Target DB: ${user}@${host}:${port}/${database}\n`);

  const seeds = loadSiteContentSeeds();
  const db = await mysql.createConnection({ host, user, password, database, port });

  try {
    const pending = await collectPending(db, database, seeds);

    console.log("========== PENDING ACTIONS ==========");
    if (pending.length === 0) {
      console.log("(none)");
    } else {
      for (const a of pending) {
        console.log(`[${a.category}] ${a.description}`);
      }
    }
    console.log(`\nPending: ${pending.length}`);

    if (!APPLY) {
      console.log("\nNo changes made");
      process.exit(0);
    }

    console.log("\n========== APPLYING ==========");
    let failed = 0;
    for (const a of pending) {
      try {
        await a.run(db);
        console.log(`OK  [${a.category}] ${a.description}`);
      } catch (err) {
        failed += 1;
        console.error(`FAIL [${a.category}] ${a.description}: ${err?.message || err}`);
      }
    }

    const after = await collectPending(db, database, seeds);
    console.log(`\nPending after apply: ${after.length}`);
    if (after.length > 0) {
      for (const a of after) {
        console.log(`  still: [${a.category}] ${a.description}`);
      }
    }

    if (failed > 0 || after.length > 0) {
      process.exit(1);
    }
    process.exit(0);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error("FAIL:", err?.message || err);
  process.exit(1);
});
