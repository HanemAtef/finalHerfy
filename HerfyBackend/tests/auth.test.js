const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  for (const col of Object.values(mongoose.connection.collections)) {
    await col.deleteMany({});
  }
});

// Helper: create a verified customer and return their JWT
async function createVerifiedCustomer(overrides = {}) {
  const user = await User.create({
    name: 'Test Customer',
    email: 'customer@test.com',
    password: 'Password123!',
    role: 'customer',
    isVerified: true,
    phone: '+10000000001',
    ...overrides,
  });
  const { generateAccessToken } = require('../utils/generateToken');
  return { user, token: generateAccessToken(user) };
}

describe('Auth — register', () => {
  it('registers a new customer and returns 201 with needsVerification', async () => {
    const res = await request(app).post('/api/users/register').send({
      name: 'New User',
      email: 'new@test.com',
      password: 'Password123!',
      role: 'customer',
      phone: '+10000000099',
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.needsVerification).toBe(true);
  });

  it('rejects duplicate email with 400', async () => {
    await User.create({ name: 'A', email: 'dup@test.com', password: 'x', role: 'customer', isVerified: true });
    const res = await request(app).post('/api/users/register').send({
      name: 'B',
      email: 'dup@test.com',
      password: 'Password123!',
      role: 'customer',
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects admin role registration', async () => {
    const res = await request(app).post('/api/users/register').send({
      name: 'Admin',
      email: 'admin@test.com',
      password: 'Password123!',
      role: 'admin',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Auth — login', () => {
  it('logs in a verified user and returns token + refreshToken', async () => {
    await User.create({
      name: 'Login User',
      email: 'login@test.com',
      password: 'Password123!',
      role: 'customer',
      isVerified: true,
      phone: '+10000000002',
    });
    const res = await request(app).post('/api/users/login').send({
      email: 'login@test.com',
      password: 'Password123!',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('rejects wrong password with 400', async () => {
    await User.create({
      name: 'WP User',
      email: 'wp@test.com',
      password: 'Password123!',
      role: 'customer',
      isVerified: true,
      phone: '+10000000003',
    });
    const res = await request(app).post('/api/users/login').send({
      email: 'wp@test.com',
      password: 'WrongPass!',
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unverified user with 403', async () => {
    await User.create({
      name: 'Unverified',
      email: 'unverified@test.com',
      password: 'Password123!',
      role: 'customer',
      isVerified: false,
      phone: '+10000000004',
    });
    const res = await request(app).post('/api/users/login').send({
      email: 'unverified@test.com',
      password: 'Password123!',
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.needsVerification).toBe(true);
  });

  it('rejects banned user with 403', async () => {
    await User.create({
      name: 'Banned',
      email: 'banned@test.com',
      password: 'Password123!',
      role: 'customer',
      isVerified: true,
      isBanned: true,
      phone: '+10000000005',
    });
    const res = await request(app).post('/api/users/login').send({
      email: 'banned@test.com',
      password: 'Password123!',
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('Auth — OTP email verification', () => {
  it('verifies email with correct OTP', async () => {
    const user = await User.create({
      name: 'OTP User',
      email: 'otp@test.com',
      password: 'Password123!',
      role: 'customer',
      isVerified: false,
      emailOtp: '123456',
      emailOtpExpire: Date.now() + 10 * 60 * 1000,
      phone: '+10000000006',
    });
    const res = await request(app).post('/api/users/verify-email').send({
      email: 'otp@test.com',
      otp: '123456',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('rejects expired OTP with 400', async () => {
    await User.create({
      name: 'Expired OTP',
      email: 'expiredotp@test.com',
      password: 'Password123!',
      role: 'customer',
      isVerified: false,
      emailOtp: '999999',
      emailOtpExpire: Date.now() - 1000,
      phone: '+10000000007',
    });
    const res = await request(app).post('/api/users/verify-email').send({
      email: 'expiredotp@test.com',
      otp: '999999',
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects wrong OTP with 400', async () => {
    await User.create({
      name: 'Wrong OTP',
      email: 'wrongotp@test.com',
      password: 'Password123!',
      role: 'customer',
      isVerified: false,
      emailOtp: '111111',
      emailOtpExpire: Date.now() + 10 * 60 * 1000,
      phone: '+10000000008',
    });
    const res = await request(app).post('/api/users/verify-email').send({
      email: 'wrongotp@test.com',
      otp: '000000',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Auth — password reset OTP', () => {
  it('resets password with valid OTP', async () => {
    await User.create({
      name: 'Reset User',
      email: 'reset@test.com',
      password: 'OldPass123!',
      role: 'customer',
      isVerified: true,
      otp: '654321',
      otpExpire: Date.now() + 5 * 60 * 1000,
      phone: '+10000000009',
    });
    const res = await request(app).post('/api/users/reset-password').send({
      email: 'reset@test.com',
      otp: '654321',
      newPassword: 'NewPass123!',
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects invalid OTP on reset', async () => {
    await User.create({
      name: 'Bad Reset',
      email: 'badreset@test.com',
      password: 'OldPass123!',
      role: 'customer',
      isVerified: true,
      otp: '111111',
      otpExpire: Date.now() + 5 * 60 * 1000,
      phone: '+10000000010',
    });
    const res = await request(app).post('/api/users/reset-password').send({
      email: 'badreset@test.com',
      otp: '000000',
      newPassword: 'NewPass123!',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Auth — refresh token', () => {
  it('issues new token pair with valid refresh token', async () => {
    const { user, token } = await createVerifiedCustomer({ email: 'refresh@test.com', phone: '+10000000011' });
    const loginRes = await request(app).post('/api/users/login').send({
      email: 'refresh@test.com',
      password: 'Password123!',
    });
    const { refreshToken } = loginRes.body;
    const res = await request(app).post('/api/users/refresh').send({ refreshToken });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('rejects invalid refresh token with 401', async () => {
    const res = await request(app).post('/api/users/refresh').send({ refreshToken: 'bogus' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Auth — logout', () => {
  it('revokes refresh token on logout', async () => {
    await createVerifiedCustomer({ email: 'logout@test.com', phone: '+10000000012' });
    const loginRes = await request(app).post('/api/users/login').send({
      email: 'logout@test.com',
      password: 'Password123!',
    });
    const { refreshToken } = loginRes.body;
    const logoutRes = await request(app).post('/api/users/logout').send({ refreshToken });
    expect(logoutRes.statusCode).toBe(200);

    // Refresh should now fail
    const refreshRes = await request(app).post('/api/users/refresh').send({ refreshToken });
    expect(refreshRes.statusCode).toBe(401);
  });
});

describe('Auth — JWT rejection', () => {
  it('rejects request with invalid JWT', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.statusCode).toBe(401);
  });

  it('rejects request with expired JWT', async () => {
    const jwt = require('jsonwebtoken');
    const expiredToken = jwt.sign(
      { id: new mongoose.Types.ObjectId(), role: 'customer' },
      process.env.JWT_SECRET,
      { expiresIn: '0s' }
    );
    await new Promise(r => setTimeout(r, 10));
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.statusCode).toBe(401);
  });
});
