// generate JWT access + refresh tokens
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "15m",
      issuer: "my-app",
      algorithm: "HS256",
      audience: "my-users",
    }
  );
};

// Refresh tokens are opaque random strings (not JWTs) — the client just
// stores and replays them, the server is the only one that needs to
// understand them (via the RefreshToken collection).
const generateRefreshTokenValue = () => crypto.randomBytes(48).toString("hex");

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

// Backwards-compatible default export: existing call sites do
// `generateToken(user)` to get the access token.
const generateToken = generateAccessToken;

module.exports = generateToken;
module.exports.generateAccessToken = generateAccessToken;
module.exports.generateRefreshTokenValue = generateRefreshTokenValue;
module.exports.hashToken = hashToken;
