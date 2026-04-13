import sharp from 'sharp';

export interface PreprocessOptions {
  /** Max dimension (longest edge) in pixels. Default 1536. */
  maxDimension?: number;
  /** JPEG quality 1-100. Default 85. */
  quality?: number;
}

export interface PreprocessResult {
  buffer: Buffer;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  originalBytes: number;
  processedBytes: number;
}

/**
 * Resize to maxDimension on the longest edge, apply EXIF orientation, strip
 * metadata, re-encode as JPEG. Big cost/latency win before sending to vision APIs.
 * Falls back to the original buffer if sharp cannot decode (e.g. unsupported format).
 */
export async function preprocessForVision(
  input: Buffer,
  originalMime: string,
  opts: PreprocessOptions = {}
): Promise<PreprocessResult> {
  const maxDimension = opts.maxDimension ?? 1536;
  const quality = opts.quality ?? 85;

  try {
    const pipeline = sharp(input, { failOn: 'none' }).rotate();
    const meta = await pipeline.metadata();

    const needsResize =
      (meta.width ?? 0) > maxDimension || (meta.height ?? 0) > maxDimension;

    const out = await (needsResize
      ? pipeline.resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
      : pipeline
    )
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: out.data,
      mimeType: 'image/jpeg',
      width: out.info.width,
      height: out.info.height,
      originalBytes: input.length,
      processedBytes: out.data.length,
    };
  } catch (err) {
    console.warn(
      `Image preprocessing failed (${(err as Error).message}); sending original ${originalMime} buffer`
    );
    return {
      buffer: input,
      mimeType: 'image/jpeg',
      width: 0,
      height: 0,
      originalBytes: input.length,
      processedBytes: input.length,
    };
  }
}
