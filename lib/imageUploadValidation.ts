import path from "path";

/** Raster formats supported by shared magic-byte sniffing. */
export type RasterFormat = "jpeg" | "png" | "webp" | "gif" | "ico";

export type ParsedRasterImage = {
  mime: string;
  buffer: Buffer;
  format: RasterFormat;
  /** Rebuild a clean data URL for upstream uploaders (Cloudinary). */
  dataUrl: string;
};

export type ParseImageResult =
  | { ok: true; data: ParsedRasterImage }
  | { ok: false; error: string };

export type ImageValidationOptions = {
  allowedFormats: readonly RasterFormat[];
  maxRawBytes: number;
  unsupportedMessage?: string;
  invalidMagicMessage?: string;
};

/** CMS / generic product-blog uploads (Phase 8). */
export const CMS_IMAGE_FORMATS: readonly RasterFormat[] = ["jpeg", "png", "webp", "gif"];
export const CMS_MAX_RAW_BYTES = 8 * 1024 * 1024;

/** Favicon uploads — raster only; no SVG. */
export const FAVICON_IMAGE_FORMATS: readonly RasterFormat[] = ["png", "jpeg", "ico"];
export const FAVICON_MAX_RAW_BYTES = 1 * 1024 * 1024;

const FORMAT_MIMES: Record<RasterFormat, readonly string[]> = {
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  gif: ["image/gif"],
  ico: ["image/x-icon", "image/vnd.microsoft.icon"],
};

export function detectMagicFormat(buf: Buffer): RasterFormat | null {
  if (!buf || buf.length < 4) return null;

  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";

  // PNG
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "png";
  }

  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "gif";

  // ICO: 00 00 01 00
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) return "ico";

  // RIFF....WEBP
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "webp";
  }

  return null;
}

export function canonicalMimeForFormat(format: RasterFormat): string {
  return FORMAT_MIMES[format][0];
}

function allowedMimeSet(formats: readonly RasterFormat[]): Set<string> {
  const set = new Set<string>();
  for (const f of formats) {
    for (const m of FORMAT_MIMES[f]) set.add(m);
  }
  return set;
}

function mimeMatchesFormat(declared: string, format: RasterFormat): boolean {
  return FORMAT_MIMES[format].includes(declared);
}

/**
 * Parse and validate a `data:<mime>;base64,<payload>` image.
 * Declared MIME must match magic bytes; payload size capped.
 */
export function parseDataUrlImage(
  file: unknown,
  options: ImageValidationOptions
): ParseImageResult {
  if (typeof file !== "string" || !file.startsWith("data:")) {
    return { ok: false, error: "Invalid image payload" };
  }

  const match = file.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (!match) return { ok: false, error: "Invalid image data URL" };

  const declared = String(match[1] || "")
    .trim()
    .toLowerCase();
  const allowedMimes = allowedMimeSet(options.allowedFormats);

  if (!allowedMimes.has(declared)) {
    return {
      ok: false,
      error:
        options.unsupportedMessage ||
        "Unsupported image type",
    };
  }

  // Reject whitespace-only / empty payload before decode
  const b64 = String(match[2] || "").replace(/\s+/g, "");
  if (!b64) return { ok: false, error: "Empty image" };

  let buffer: Buffer;
  try {
    buffer = Buffer.from(b64, "base64");
  } catch {
    return { ok: false, error: "Invalid image encoding" };
  }

  if (!buffer.length) return { ok: false, error: "Empty image" };
  if (buffer.length > options.maxRawBytes) {
    const mb = Math.max(1, Math.round(options.maxRawBytes / (1024 * 1024)));
    return { ok: false, error: `Image too large (max ${mb} MB)` };
  }

  const magic = detectMagicFormat(buffer);
  if (!magic || !options.allowedFormats.includes(magic)) {
    return {
      ok: false,
      error:
        options.invalidMagicMessage ||
        "File content is not a valid image",
    };
  }

  if (!mimeMatchesFormat(declared, magic)) {
    return { ok: false, error: "Declared MIME type does not match file content" };
  }

  const canonicalMime = canonicalMimeForFormat(magic);
  const dataUrl = `data:${canonicalMime};base64,${buffer.toString("base64")}`;

  return {
    ok: true,
    data: {
      mime: canonicalMime,
      buffer,
      format: magic,
      dataUrl,
    },
  };
}

/** Basename + safe charset; metadata only (never used as Cloudinary public_id). */
export function sanitizeUploadFilename(name: unknown, fallback = "image"): string {
  const base = path.basename(String(name || fallback).replace(/\\/g, "/"));
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
  return cleaned || fallback;
}
