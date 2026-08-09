// Silence console noise during tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.JWT_EXPIRES_IN = '15m';
process.env.RATE_LIMIT_AUTH_MAX = '100';
process.env.RATE_LIMIT_GLOBAL_MAX = '1000';
