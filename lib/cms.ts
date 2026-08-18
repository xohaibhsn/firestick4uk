export type SiteContentMap = Record<string, string>;

export function cms(sc: SiteContentMap | undefined, key: string, fallback = ""): string {
  if (!sc) return fallback;
  const raw = sc[key];
  if (raw == null) return fallback;
  const trimmed = String(raw).trim();
  return trimmed === "" ? fallback : trimmed;
}

export function cmsJson<T>(sc: SiteContentMap | undefined, key: string, fallback: T): T {
  if (!sc) return fallback;
  const raw = sc[key];
  if (!raw || !String(raw).trim()) return fallback;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function fillVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}
