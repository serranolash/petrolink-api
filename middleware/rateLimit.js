function rateLimit({ windowMs = 60_000, max = 60, keyFn = (req) => `${req.ip}:${req.path}` } = {}) {
  const hits = new Map();

  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      return res.status(429).json({
        error: "Rate limit exceeded",
        code: "RATE_LIMIT_EXCEEDED"
      });
    }

    return next();
  };
}

module.exports = { rateLimit };
