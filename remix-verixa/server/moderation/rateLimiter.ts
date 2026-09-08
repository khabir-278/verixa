import { Request, Response, NextFunction } from 'express';

interface RateLimitBucket {
  count: number;
  resetTime: number;
}

const ipBuckets = new Map<string, RateLimitBucket>();

// Clean up stale buckets every 5 minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  Array.from(ipBuckets.entries()).forEach(([ip, bucket]) => {
    if (bucket.resetTime <= now) {
      ipBuckets.delete(ip);
    }
  });
}, 5 * 60 * 1000);
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

/**
 * Creates rate-limiting middleware for public moderation endpoints
 * @param maxRequests Maximum allowed requests per window
 * @param windowMs Time window in milliseconds (default 1 minute)
 */
export function createRateLimiter(maxRequests: number = 60, windowMs: number = 60 * 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown-client';

    const now = Date.now();
    let bucket = ipBuckets.get(clientIp);

    if (!bucket || bucket.resetTime <= now) {
      bucket = { count: 1, resetTime: now + windowMs };
      ipBuckets.set(clientIp, bucket);
      return next();
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      const retryAfterSec = Math.ceil((bucket.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec.toString());
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded on moderation gateway. Please slow down and try again.',
        retry_after: retryAfterSec,
      });
    }

    return next();
  };
}
