// Client-side image downscaling for document uploads.
//
// Why this exists: the most common mobile action in the app is a parent
// photographing a birth certificate or insurance card. A modern phone camera
// produces 4-12 MB JPEGs, which blow past the 10 MB upload ceiling, take
// forever on cell data, and carry far more resolution than a legibility check
// needs. Downscaling to ~1600px on the long edge keeps small print readable
// while typically cutting the payload by an order of magnitude.
//
// The geometry and the should-we-bother decision live here as pure functions so
// they can be unit-tested; the canvas work is a thin wrapper around them.

/** Long-edge cap, in pixels. Comfortably legible for scanned paperwork. */
export const MAX_IMAGE_DIMENSION = 1600;

/** JPEG quality for re-encoded images. */
export const IMAGE_QUALITY = 0.82;

/** Images below this size are uploaded untouched — re-encoding could only hurt. */
export const COMPRESSION_THRESHOLD_BYTES = 512 * 1024;

/** Formats safe to re-encode. PDFs and Office docs must pass through unchanged. */
const COMPRESSIBLE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Scales dimensions so the long edge fits `maxDimension`, preserving aspect
 * ratio. Images already within the cap are returned unchanged — upscaling a
 * small photo would add bytes without adding detail.
 */
export function computeScaledDimensions(width, height, maxDimension = MAX_IMAGE_DIMENSION) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }

  const longEdge = Math.max(width, height);
  if (longEdge <= maxDimension) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  const ratio = maxDimension / longEdge;
  // Guard against a rounding-to-zero on extreme aspect ratios (e.g. a 20000x3
  // scan) — a zero-width canvas throws.
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/**
 * Whether a selected file is worth re-encoding. HEIC is deliberately excluded:
 * canvas cannot decode it in most browsers, and iOS already transcodes to JPEG
 * when a photo leaves the picker.
 */
export function shouldCompressImage(file, threshold = COMPRESSION_THRESHOLD_BYTES) {
  if (!file || typeof file.type !== 'string') return false;
  if (!COMPRESSIBLE_TYPES.includes(file.type)) return false;
  return (file.size || 0) > threshold;
}

/** Swaps a filename's extension to .jpg after re-encoding. */
export function toJpegFilename(name) {
  if (!name || typeof name !== 'string') return 'upload.jpg';
  return /\.[a-z0-9]+$/i.test(name) ? name.replace(/\.[a-z0-9]+$/i, '.jpg') : `${name}.jpg`;
}

/**
 * Downscales an image file, returning a new File. Non-images, small images, and
 * any failure along the way resolve to the original file — a failed compression
 * must never block an upload, since the upload is the thing the user actually
 * asked for.
 */
export async function compressImageFile(file, options = {}) {
  const {
    maxDimension = MAX_IMAGE_DIMENSION,
    quality = IMAGE_QUALITY,
    threshold = COMPRESSION_THRESHOLD_BYTES,
  } = options;

  if (!shouldCompressImage(file, threshold)) return file;
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const { width, height } = computeScaledDimensions(bitmap.width, bitmap.height, maxDimension);
    if (!width || !height) return file;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;

    // Re-encoding can enlarge an already well-compressed image; keep whichever
    // is smaller so we never make the upload worse.
    if (blob.size >= file.size) return file;

    return new File([blob], toJpegFilename(file.name), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap?.close?.();
  }
}
