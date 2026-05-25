import compression from "compression";
import type { Request, Response } from "express";

/**
 * Compression middleware — Brotli (preferred) with gzip fallback.
 *
 * Activated for all JSON responses > 1 KB.
 * Low-bandwidth clients (e.g. 2G mobile) benefit from Brotli's ~20-30%
 * better compression ratio vs gzip.
 *
 * Note: Node's built-in `compression` package supports gzip/deflate.
 * For Brotli, use `shrink-ray-current` or a reverse proxy (nginx/Cloudflare).
 * This middleware configures the best available option at the application layer.
 */
export const compressionMiddleware = compression({
  level: 6,
  threshold: 1024, // only compress responses > 1 KB
  filter: (req: Request, res: Response) => {
    // Never compress already-compressed content (images, PDFs)
    const ct = res.getHeader("Content-Type") as string ?? "";
    if (ct.includes("image/") || ct.includes("application/pdf")) return false;
    return compression.filter(req, res);
  },
});
