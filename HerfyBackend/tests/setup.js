// tests/setup.js — runs before all test files (before Jest globals are available)
process.env.NODE_ENV = 'test';

// Ensure required env vars exist so config files don't throw
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
if (!process.env.STRIPE_SECRET_KEY) process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_key';
if (!process.env.STRIPE_WEBHOOK_SECRET) process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
