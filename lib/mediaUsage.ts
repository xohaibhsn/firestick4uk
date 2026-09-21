import pool from "@/lib/db";

export type MediaUsageEntityType = "product" | "blog" | "site_content" | "section";

export type MediaUsageReference = {
  entityType: MediaUsageEntityType;
  entityId: string;
  entityLabel: string;
  field: string;
  fieldLabel: string;
  location?: string | null;
  active?: boolean | null;
  status?: string | null;
  path?: string | null;
  pageName?: string | null;
  contentType?: string | null;
};

export type MediaUsageSummary = {
  total: number;
  products: number;
  blogs: number;
  siteContent: number;
  sections: number;
};

export type MediaUsageResult = {
  usage: MediaUsageReference[];
  summary: MediaUsageSummary;
};

function dedupeKey(ref: MediaUsageReference): string {
  return [ref.entityType, ref.entityId, ref.field, ref.path || ""].join("|");
}

function dedupeRefs(refs: MediaUsageReference[]): MediaUsageReference[] {
  const seen = new Set<string>();
  const out: MediaUsageReference[] = [];
  for (const ref of refs) {
    const key = dedupeKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

function summarize(usage: MediaUsageReference[]): MediaUsageSummary {
  const summary: MediaUsageSummary = {
    total: usage.length,
    products: 0,
    blogs: 0,
    siteContent: 0,
    sections: 0,
  };
  for (const ref of usage) {
    if (ref.entityType === "product") summary.products += 1;
    else if (ref.entityType === "blog") summary.blogs += 1;
    else if (ref.entityType === "section") summary.sections += 1;
    else summary.siteContent += 1;
  }
  return summary;
}

/** Recursively find JSON paths whose string value equals or contains needle. */
export function findJsonUrlPaths(value: unknown, needle: string, basePath = ""): string[] {
  if (!needle) return [];
  const paths: string[] = [];

  if (typeof value === "string") {
    if (value === needle || value.includes(needle)) {
      paths.push(basePath || "(root)");
    }
    return paths;
  }

  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      paths.push(...findJsonUrlPaths(item, needle, basePath ? `${basePath}.${i}` : String(i)));
    });
    return paths;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const next = basePath ? `${basePath}.${key}` : key;
      paths.push(...findJsonUrlPaths(child, needle, next));
    }
  }

  return paths;
}

async function findProductUsage(url: string): Promise<MediaUsageReference[]> {
  const [rows]: any = await pool.query(
    `SELECT id, name, slug, active, image, og_image, description, short_description, full_description
     FROM products
     WHERE INSTR(COALESCE(image, ''), ?) > 0
        OR INSTR(COALESCE(og_image, ''), ?) > 0
        OR INSTR(COALESCE(description, ''), ?) > 0
        OR INSTR(COALESCE(short_description, ''), ?) > 0
        OR INSTR(COALESCE(full_description, ''), ?) > 0`,
    [url, url, url, url, url]
  );

  const refs: MediaUsageReference[] = [];
  for (const row of rows || []) {
    const id = String(row.id);
    const label = String(row.name || `Product #${id}`);
    const slug = String(row.slug || "").trim();
    const location = slug ? `/products/${slug}` : null;
    const active = Number(row.active) === 1;

    const fields: Array<{ key: string; label: string; value: unknown }> = [
      { key: "image", label: "Main image", value: row.image },
      { key: "og_image", label: "OG image", value: row.og_image },
      { key: "description", label: "Description", value: row.description },
      { key: "short_description", label: "Short description", value: row.short_description },
      { key: "full_description", label: "Full description", value: row.full_description },
    ];

    for (const f of fields) {
      const raw = String(f.value || "");
      if (!raw.includes(url)) continue;
      refs.push({
        entityType: "product",
        entityId: id,
        entityLabel: label,
        field: f.key,
        fieldLabel: f.label,
        location,
        active,
      });
    }
  }
  return refs;
}

async function findBlogUsage(url: string): Promise<MediaUsageReference[]> {
  const [rows]: any = await pool.query(
    `SELECT id, title, slug, status, active, featured_image, content
     FROM blog_posts
     WHERE INSTR(COALESCE(featured_image, ''), ?) > 0
        OR INSTR(COALESCE(content, ''), ?) > 0`,
    [url, url]
  );

  const refs: MediaUsageReference[] = [];
  for (const row of rows || []) {
    const id = String(row.id);
    const label = String(row.title || `Blog #${id}`);
    const slug = String(row.slug || "").trim();
    const location = slug ? `/blog/${slug}` : null;
    const status = row.status != null ? String(row.status) : null;
    const active = row.active == null ? null : Number(row.active) === 1;

    if (String(row.featured_image || "").includes(url)) {
      refs.push({
        entityType: "blog",
        entityId: id,
        entityLabel: label,
        field: "featured_image",
        fieldLabel: "Featured image",
        location,
        active,
        status,
      });
    }
    if (String(row.content || "").includes(url)) {
      refs.push({
        entityType: "blog",
        entityId: id,
        entityLabel: label,
        field: "content",
        fieldLabel: "Inline content",
        location,
        active,
        status,
      });
    }
  }
  return refs;
}

function classifySiteContentRow(row: any, url: string): MediaUsageReference[] {
  const id = String(row.id);
  const contentKey = String(row.content_key || "");
  const contentType = String(row.content_type || "");
  const pageName = row.page_name != null ? String(row.page_name) : null;
  const label = String(row.label || contentKey || `Content #${id}`);
  const value = String(row.content_value || "");
  const isVisible = row.is_visible == null ? null : Number(row.is_visible) === 1;

  if (contentType === "json") {
    const refs: MediaUsageReference[] = [];
    let paths: string[] = [];
    try {
      const parsed = JSON.parse(value);
      paths = findJsonUrlPaths(parsed, url);
    } catch {
      paths = [];
    }

    if (paths.length === 0) {
      refs.push({
        entityType: "section",
        entityId: contentKey || id,
        entityLabel: label,
        field: "content_value",
        fieldLabel: "Page Builder JSON",
        path: null,
        pageName,
        contentType,
        active: isVisible,
      });
      return refs;
    }

    for (const jsonPath of paths) {
      refs.push({
        entityType: "section",
        entityId: contentKey || id,
        entityLabel: label,
        field: jsonPath,
        fieldLabel: jsonPath === "hero_image" ? "Hero image" : `JSON · ${jsonPath}`,
        path: jsonPath,
        pageName,
        contentType,
        active: isVisible,
      });
    }
    return refs;
  }

  // Direct image / exact URL / other content containing URL
  const isDirectImage =
    contentType === "image" || value.trim() === url || contentType === "url";

  return [
    {
      entityType: "site_content",
      entityId: contentKey || id,
      entityLabel: label,
      field: contentKey || "content_value",
      fieldLabel: isDirectImage ? "Site image" : "Site content",
      pageName,
      contentType,
      active: isVisible,
    },
  ];
}

async function findSiteContentUsage(url: string): Promise<MediaUsageReference[]> {
  const [rows]: any = await pool.query(
    `SELECT id, content_key, content_value, content_type, page_name, label, is_visible, section_order
     FROM site_content
     WHERE INSTR(COALESCE(content_value, ''), ?) > 0`,
    [url]
  );

  const refs: MediaUsageReference[] = [];
  for (const row of rows || []) {
    refs.push(...classifySiteContentRow(row, url));
  }
  return refs;
}

/** Scan current CMS tables for references to an asset URL. Does not touch revisions/audit. */
export async function findMediaUsageByUrl(url: string): Promise<MediaUsageResult> {
  const needle = String(url || "").trim();
  if (!needle) {
    return { usage: [], summary: summarize([]) };
  }

  const [products, blogs, site] = await Promise.all([
    findProductUsage(needle),
    findBlogUsage(needle),
    findSiteContentUsage(needle),
  ]);

  const usage = dedupeRefs([...products, ...blogs, ...site]);
  return { usage, summary: summarize(usage) };
}
