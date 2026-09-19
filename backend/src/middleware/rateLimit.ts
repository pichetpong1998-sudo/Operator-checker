import rateLimit from "express-rate-limit";

// ป้องกัน brute-force PIN — จำกัด login 10 ครั้ง / 5 นาที ต่อ IP
export const loginRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_login_attempts" },
});

export const generalApiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
