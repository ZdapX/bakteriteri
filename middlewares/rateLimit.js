
const rateLimit = require('express-rate-limit');

const createRateLimiter = (windowMs, max) => {
  return rateLimit({
    windowMs: windowMs * 60 * 1000, // Menit ke milidetik
    max: max,
    message: {
      success: false,
      error: `Terlalu banyak request. Silakan coba lagi setelah ${windowMs} menit.`
    },
    standardHeaders: true,
    legacyHeaders: false
  });
};

// Rate limit untuk generate image (lebih ketat)
const generateImageLimiter = createRateLimiter(15, 50);

// Rate limit untuk create account (sangat ketat)
const createAccountLimiter = createRateLimiter(60, 10);

// Rate limit umum
const apiLimiter = createRateLimiter(15, 100);

module.exports = {
  generateImageLimiter,
  createAccountLimiter,
  apiLimiter
};
