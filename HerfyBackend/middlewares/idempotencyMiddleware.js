// Idempotency middleware: if the same Idempotency-Key header is seen again
// within the TTL window (24 h), return the cached original response instead
// of re-processing the request.
const IdempotencyKey = require('../models/IdempotencyKey');

const idempotency = async (req, res, next) => {
  const key = req.headers['idempotency-key'];
  if (!key) return next();

  // Require auth before idempotency check (authMiddleware runs first)
  const userId = req.user?._id || req.user?.id;
  if (!userId) return next();

  try {
    const existing = await IdempotencyKey.findOne({ key, userId });
    if (existing) {
      return res.status(existing.statusCode).json(existing.responseBody);
    }

    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      if (res.statusCode < 500) {
        try {
          await IdempotencyKey.create({
            key,
            userId,
            statusCode: res.statusCode,
            responseBody: body,
          });
        } catch (e) {
          // Duplicate key race — another request with same key just saved; ignore
          if (e.code !== 11000) console.error('[Idempotency] cache error:', e.message);
        }
      }
      return originalJson(body);
    };

    next();
  } catch (err) {
    console.error('[Idempotency] middleware error:', err.message);
    next();
  }
};

module.exports = idempotency;
