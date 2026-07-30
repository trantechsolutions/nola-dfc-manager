import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  MAX_IMAGE_DIMENSION,
  COMPRESSION_THRESHOLD_BYTES,
  computeScaledDimensions,
  shouldCompressImage,
  toJpegFilename,
  compressImageFile,
} from '../../utils/imageCompression';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Builds a File-like object of a given type and size without allocating bytes. */
function makeFile({ name = 'photo.jpg', type = 'image/jpeg', size = 4 * 1024 * 1024 } = {}) {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size, configurable: true });
  return file;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('computeScaledDimensions', () => {
  it('scales a landscape image so the long edge hits the cap', () => {
    expect(computeScaledDimensions(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('scales a portrait image on its height', () => {
    expect(computeScaledDimensions(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('leaves an image already within the cap untouched — never upscales', () => {
    expect(computeScaledDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('treats an image exactly at the cap as a no-op', () => {
    expect(computeScaledDimensions(1600, 900, 1600)).toEqual({ width: 1600, height: 900 });
  });

  it('preserves aspect ratio', () => {
    const { width, height } = computeScaledDimensions(4032, 3024, 1600);
    expect(width / height).toBeCloseTo(4032 / 3024, 2);
  });

  it('never rounds a dimension down to zero on an extreme aspect ratio', () => {
    const { width, height } = computeScaledDimensions(20000, 3, 1600);
    expect(width).toBe(1600);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it('defaults to the exported cap', () => {
    expect(computeScaledDimensions(4000, 4000)).toEqual({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
    });
  });

  it('returns zeroes for invalid input rather than NaN', () => {
    expect(computeScaledDimensions(0, 100)).toEqual({ width: 0, height: 0 });
    expect(computeScaledDimensions(-5, 100)).toEqual({ width: 0, height: 0 });
    expect(computeScaledDimensions(NaN, 100)).toEqual({ width: 0, height: 0 });
    expect(computeScaledDimensions(undefined, undefined)).toEqual({ width: 0, height: 0 });
  });
});

describe('shouldCompressImage', () => {
  it('accepts a large camera JPEG', () => {
    expect(shouldCompressImage(makeFile({ size: 5 * 1024 * 1024 }))).toBe(true);
  });

  it('accepts large PNG and WebP', () => {
    expect(shouldCompressImage(makeFile({ type: 'image/png', size: 2 * 1024 * 1024 }))).toBe(true);
    expect(shouldCompressImage(makeFile({ type: 'image/webp', size: 2 * 1024 * 1024 }))).toBe(true);
  });

  it('skips images already below the threshold', () => {
    expect(shouldCompressImage(makeFile({ size: 100 * 1024 }))).toBe(false);
  });

  it('treats a file exactly at the threshold as not worth re-encoding', () => {
    expect(shouldCompressImage(makeFile({ size: COMPRESSION_THRESHOLD_BYTES }))).toBe(false);
  });

  it('never touches PDFs or Office documents', () => {
    expect(shouldCompressImage(makeFile({ name: 'form.pdf', type: 'application/pdf', size: 9e6 }))).toBe(false);
    expect(
      shouldCompressImage(
        makeFile({
          name: 'f.docx',
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 9e6,
        }),
      ),
    ).toBe(false);
  });

  it('skips HEIC, which canvas cannot decode', () => {
    expect(shouldCompressImage(makeFile({ name: 'IMG.heic', type: 'image/heic', size: 4e6 }))).toBe(false);
  });

  it('handles null and typeless files without throwing', () => {
    expect(shouldCompressImage(null)).toBe(false);
    expect(shouldCompressImage({})).toBe(false);
  });

  it('honours a custom threshold', () => {
    expect(shouldCompressImage(makeFile({ size: 1000 }), 500)).toBe(true);
  });
});

describe('toJpegFilename', () => {
  it('swaps a known extension', () => {
    expect(toJpegFilename('birth-certificate.png')).toBe('birth-certificate.jpg');
    expect(toJpegFilename('SCAN.HEIC')).toBe('SCAN.jpg');
  });

  it('appends when there is no extension', () => {
    expect(toJpegFilename('scan')).toBe('scan.jpg');
  });

  it('only replaces the final extension', () => {
    expect(toJpegFilename('my.document.png')).toBe('my.document.jpg');
  });

  it('falls back for empty or non-string names', () => {
    expect(toJpegFilename('')).toBe('upload.jpg');
    expect(toJpegFilename(null)).toBe('upload.jpg');
  });
});

describe('compressImageFile', () => {
  /** Stubs createImageBitmap and canvas so the pipeline can run under jsdom. */
  function stubCanvas({ bitmapWidth = 4000, bitmapHeight = 3000, blobSize = 200 * 1024, blob = true } = {}) {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: bitmapWidth, height: bitmapHeight, close }));

    const drawImage = vi.fn();
    const toBlob = vi.fn((cb) => cb(blob ? { size: blobSize, type: 'image/jpeg' } : null));
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toBlob };
    vi.spyOn(document, 'createElement').mockImplementation((tag) =>
      tag === 'canvas' ? canvas : document.createElement.wrappedMethod?.(tag),
    );

    return { canvas, drawImage, close };
  }

  it('returns a smaller jpeg File for an oversized photo', async () => {
    stubCanvas({ blobSize: 200 * 1024 });
    const original = makeFile({ name: 'photo.png', type: 'image/png', size: 5 * 1024 * 1024 });

    const result = await compressImageFile(original);

    expect(result).not.toBe(original);
    expect(result.name).toBe('photo.jpg');
    expect(result.type).toBe('image/jpeg');
  });

  it('sizes the canvas to the scaled dimensions', async () => {
    const { canvas } = stubCanvas({ bitmapWidth: 4000, bitmapHeight: 3000 });

    await compressImageFile(makeFile({ size: 5 * 1024 * 1024 }));

    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
  });

  it('releases the decoded bitmap', async () => {
    const { close } = stubCanvas();
    await compressImageFile(makeFile({ size: 5 * 1024 * 1024 }));
    expect(close).toHaveBeenCalled();
  });

  it('keeps the original when re-encoding would not shrink it', async () => {
    stubCanvas({ blobSize: 6 * 1024 * 1024 });
    const original = makeFile({ size: 5 * 1024 * 1024 });

    await expect(compressImageFile(original)).resolves.toBe(original);
  });

  it('passes small images through untouched', async () => {
    stubCanvas();
    const original = makeFile({ size: 100 * 1024 });

    await expect(compressImageFile(original)).resolves.toBe(original);
  });

  it('passes PDFs through untouched', async () => {
    stubCanvas();
    const pdf = makeFile({ name: 'form.pdf', type: 'application/pdf', size: 9e6 });

    await expect(compressImageFile(pdf)).resolves.toBe(pdf);
  });

  it('falls back to the original when decoding throws', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')));
    const original = makeFile({ size: 5 * 1024 * 1024 });

    await expect(compressImageFile(original)).resolves.toBe(original);
  });

  it('falls back to the original when toBlob yields nothing', async () => {
    stubCanvas({ blob: false });
    const original = makeFile({ size: 5 * 1024 * 1024 });

    await expect(compressImageFile(original)).resolves.toBe(original);
  });

  it('falls back to the original when createImageBitmap is unavailable', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const original = makeFile({ size: 5 * 1024 * 1024 });

    await expect(compressImageFile(original)).resolves.toBe(original);
  });
});
