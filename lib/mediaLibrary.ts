import type { AdminRoleName, UploadPurpose } from "./adminPermissions";

export type MediaProvider = "cloudinary" | "local" | "external";
export type MediaSource = "upload" | "backfill";

/** CMS media library purposes (excludes receipts). */
export const MEDIA_LIBRARY_PURPOSES = [
  "blog",
  "products",
  "logo",
  "og",
  "whatsapp",
  "hero",
  "favicon",
] as const;

export type MediaLibraryPurpose = (typeof MEDIA_LIBRARY_PURPOSES)[number];

export function detectMediaProvider(url: string, cloudName?: string): MediaProvider {
  const u = String(url || "");
  const cloud = cloudName || "";
  if (cloud && u.includes(`res.cloudinary.com/${cloud}/`)) return "cloudinary";
  if (u.includes("res.cloudinary.com/")) return "cloudinary";
  if (u.startsWith("/uploads/")) return "local";
  return "external";
}

export function isMediaLibraryPurpose(value: unknown): value is MediaLibraryPurpose {
  return (MEDIA_LIBRARY_PURPOSES as readonly string[]).includes(String(value || ""));
}

/** Purposes each role may browse in the Media Library (not receipts). */
export function mediaPurposesForRole(role: AdminRoleName): MediaLibraryPurpose[] {
  if (role === "super_admin") return [...MEDIA_LIBRARY_PURPOSES];
  if (role === "manager") return ["blog", "products"];
  return ["blog"];
}

export function canViewMediaPurpose(role: AdminRoleName, purpose: string): boolean {
  return mediaPurposesForRole(role).includes(purpose as MediaLibraryPurpose);
}

/** Upload purposes offered from Media Library "Upload Media" (no favicon, no receipts). */
export function mediaLibraryUploadPurposes(role: AdminRoleName): MediaLibraryPurpose[] {
  if (role === "super_admin") return ["blog", "products", "logo", "og", "whatsapp", "hero"];
  if (role === "manager") return ["blog", "products"];
  return ["blog"];
}

export function formatBytes(bytes: unknown): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDimensions(width: unknown, height: unknown): string {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return "—";
  return `${Math.round(w)} × ${Math.round(h)}`;
}

export type RecordMediaAssetInput = {
  url: string;
  publicId?: string | null;
  provider?: MediaProvider;
  purpose: UploadPurpose | MediaLibraryPurpose | string;
  originalName?: string | null;
  mimeType?: string | null;
  format?: string | null;
  bytes?: number | null;
  width?: number | null;
  height?: number | null;
  resourceType?: string | null;
  source?: MediaSource;
  actor?: {
    principalType?: string;
    staffId?: number | null;
    name?: string;
  } | null;
};
