/**
 * Cloudinary delivery URL helpers (f_auto,q_auto + width).
 * Preserves the same res.cloudinary.com URL family; no CMS URL mutation in DB.
 */

const CLOUDINARY_UPLOAD =
  /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/i;

export type CloudinaryDeliveryOpts = {
  /** Max width in CSS pixels (Cloudinary w_). */
  width?: number;
  /** Optional height with crop mode. */
  height?: number;
  /** Cloudinary crop mode when height set. Default c_limit. */
  crop?: "limit" | "fill" | "fit";
  /** Quality. Default q_auto. */
  quality?: string;
  /** Format. Default f_auto. */
  format?: string;
};

/** Drop leading Cloudinary transform segment(s); keep version + public id path. */
function stripTransforms(rest: string): string {
  const parts = rest.split("/");
  let i = 0;
  while (i < parts.length) {
    const seg = parts[i];
    if (!seg) {
      i++;
      continue;
    }
    // Version folder — stop
    if (/^v\d+$/i.test(seg)) break;
    // Transform segment: contains a comma, or looks like t_ / known flags
    const isTransform =
      seg.includes(",") ||
      /^(c_|w_|h_|f_|q_|fl_|dpr_|e_|b_|g_|ar_|r_|u_|l_|o_|a_|t_)/i.test(seg);
    if (!isTransform) break;
    i++;
  }
  return parts.slice(i).join("/");
}

/**
 * Inject delivery transforms after /upload/ if not already transformed.
 * Non-Cloudinary URLs are returned unchanged.
 */
export function cloudinaryDeliveryUrl(
  src: string | null | undefined,
  opts: CloudinaryDeliveryOpts = {}
): string {
  const raw = String(src || "").trim();
  if (!raw) return "";
  const m = raw.match(CLOUDINARY_UPLOAD);
  if (!m) return raw;

  const prefix = m[1];
  const assetPath = stripTransforms(m[2]);
  if (!assetPath) return raw;

  const width = opts.width && opts.width > 0 ? Math.round(opts.width) : null;
  const height = opts.height && opts.height > 0 ? Math.round(opts.height) : null;
  const crop = opts.crop || "limit";
  const format = opts.format || "f_auto";
  const quality = opts.quality || "q_auto";

  const transforms: string[] = [];
  if (width && height) {
    transforms.push(`c_${crop}`, `w_${width}`, `h_${height}`);
  } else if (width) {
    transforms.push(`c_limit`, `w_${width}`);
  } else if (height) {
    transforms.push(`c_limit`, `h_${height}`);
  }
  transforms.push(format, quality);

  return `${prefix}${transforms.join(",")}/${assetPath}`;
}

/** Hero slide widths for responsive srcset (c_limit — same crop as heroSlideSrc). */
export const HERO_SRCSET_WIDTHS = [480, 768, 1024, 1366, 1600] as const;

/** Hero slides — default/fallback src capped at 1600 (≈2×780). */
export function heroSlideSrc(src: string): string {
  return cloudinaryDeliveryUrl(src, { width: 1600 });
}

/**
 * Responsive srcset for hero slides from the same Cloudinary asset.
 * Non-Cloudinary URLs return "" (caller keeps single src, no srcSet).
 */
export function heroSlideSrcSet(src: string): string {
  const raw = String(src || "").trim();
  if (!raw) return "";
  if (!CLOUDINARY_UPLOAD.test(raw)) return "";
  return HERO_SRCSET_WIDTHS.map(
    (w) => `${cloudinaryDeliveryUrl(raw, { width: w })} ${w}w`
  ).join(", ");
}

/** Hero is full-bleed (width: 100%) — sizes matches rendered width. */
export const HERO_SIZES = "100vw";

/** Product card / grid thumbs. */
export function productCardSrc(src: string): string {
  return cloudinaryDeliveryUrl(src, { width: 600 });
}

/** Nav / logo — small. */
export function logoSrc(src: string): string {
  return cloudinaryDeliveryUrl(src, { width: 380, height: 82, crop: "fit" });
}
