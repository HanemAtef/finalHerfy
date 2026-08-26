const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/User');
const Handyman = require('../models/Handyman');
const { generateAccessToken } = require('../utils/generateToken');

// Mock stripe & tomtom & email
jest.mock('../config/stripe', () => ({
  paymentIntents: { retrieve: jest.fn(), create: jest.fn() },
  webhooks: { constructEvent: jest.fn() },
}));
jest.mock('../utils/sendVerificationEmail', () => jest.fn().mockResolvedValue(true));
jest.mock('../utils/sendEmail', () => jest.fn().mockResolvedValue(true));

const server = require('../app');
const { MongoMemoryServer } = require('mongodb-memory-server');
let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  jest.clearAllMocks();
});

describe('User Registration & Admin Approval Flow Tests', () => {
  let adminUser;
  let adminToken;

  beforeEach(async () => {
    adminUser = await User.create({
      name: 'System Admin',
      email: 'admin@herfy.com',
      phone: '01000000000',
      password: 'adminPassword123',
      role: 'customer',
      isAdmin: true,
      status: 'approved',
      isVerified: true,
    });
    adminToken = generateAccessToken(adminUser);
  });

  test('Customer registration succeeds with status pending', async () => {
    const res = await request(server)
      .post('/api/users/register')
      .send({
        name: 'Ahmed Customer',
        email: 'ahmed@test.com',
        phone: '01012345678',
        password: 'password123',
        role: 'customer',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.email).toBe('ahmed@test.com');

    const created = await User.findOne({ email: 'ahmed@test.com' });
    expect(created).toBeTruthy();
    expect(created.status).toBe('pending');
  });

  test('Handyman registration succeeds with status pending and Handyman profile pending', async () => {
    const res = await request(server)
      .post('/api/users/register')
      .field('name', 'Mahmoud Handyman')
      .field('email', 'mahmoud@test.com')
      .field('phone', '01198765432')
      .field('password', 'password123')
      .field('role', 'handyman')
      .field('profession', 'سباك')
      .field('price', '150')
      .field('experienceYears', '5')
      .field('address', 'المعادي، القاهرة');

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.registrationStatus).toBe('pending');

    const createdUser = await User.findOne({ email: 'mahmoud@test.com' });
    expect(createdUser).toBeTruthy();
    expect(createdUser.status).toBe('pending');

    const createdHandyman = await Handyman.findOne({ userId: createdUser._id });
    expect(createdHandyman).toBeTruthy();
    expect(createdHandyman.profession).toBe('سباك');
    expect(createdHandyman.price).toBe(150);
    expect(createdHandyman.registrationStatus).toBe('pending');
  });

  test('Pending user is prevented from logging in with pending message', async () => {
    // Register handyman
    await request(server)
      .post('/api/users/register')
      .field('name', 'Mahmoud Handyman')
      .field('email', 'mahmoud@test.com')
      .field('phone', '01198765432')
      .field('password', 'password123')
      .field('role', 'handyman')
      .field('profession', 'سباك')
      .field('price', '150');

    // Attempt login
    const loginRes = await request(server)
      .post('/api/users/login')
      .send({
        email: 'mahmoud@test.com',
        password: 'password123',
      });

    expect(loginRes.status).toBe(403);
    expect(loginRes.body.status).toBe('pending');
    expect(loginRes.body.msg).toContain('pending admin approval');
  });

  test('Pending request appears in Admin pending registrations list', async () => {
    // Register handyman
    await request(server)
      .post('/api/users/register')
      .field('name', 'Hassan Electrician')
      .field('email', 'hassan@test.com')
      .field('phone', '01234567890')
      .field('password', 'password123')
      .field('role', 'handyman')
      .field('profession', 'كهربائي')
      .field('price', '200');

    // Admin fetches pending registrations
    const adminRes = await request(server)
      .get('/api/admin/pending-registrations?status=pending')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.success).toBe(true);
    expect(adminRes.body.count).toBe(1);
    expect(adminRes.body.data[0].name).toBe('Hassan Electrician');
    expect(adminRes.body.data[0].profession).toBe('كهربائي');
    expect(adminRes.body.data[0].status).toBe('pending');
  });

  test('Admin Reject changes status to rejected, prevents login, and retains record', async () => {
    // Register handyman
    await request(server)
      .post('/api/users/register')
      .field('name', 'Kareem Carpenter')
      .field('email', 'kareem@test.com')
      .field('phone', '01211112222')
      .field('password', 'password123')
      .field('role', 'handyman')
      .field('profession', 'نجار')
      .field('price', '180');

    const createdUser = await User.findOne({ email: 'kareem@test.com' });
    const createdHandyman = await Handyman.findOne({ userId: createdUser._id });

    // Admin rejects registration
    const rejectRes = await request(server)
      .patch(`/api/admin/reject-registration/${createdHandyman._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'بيانات الهوية غير واضحة' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.success).toBe(true);

    // Verify record is NOT deleted, but status = rejected
    const updatedUser = await User.findOne({ email: 'kareem@test.com' });
    expect(updatedUser).toBeTruthy();
    expect(updatedUser.status).toBe('rejected');

    const updatedHandyman = await Handyman.findOne({ userId: createdUser._id });
    expect(updatedHandyman).toBeTruthy();
    expect(updatedHandyman.registrationStatus).toBe('rejected');
    expect(updatedHandyman.adminNote).toBe('بيانات الهوية غير واضحة');

    // Attempt login with rejected account
    const loginRes = await request(server)
      .post('/api/users/login')
      .send({
        email: 'kareem@test.com',
        password: 'password123',
      });

    expect(loginRes.status).toBe(403);
    expect(loginRes.body.status).toBe('rejected');
    expect(loginRes.body.msg).toContain('rejected');
  });

  test('Admin Approve changes status to approved and allows login', async () => {
    // Register handyman
    await request(server)
      .post('/api/users/register')
      .field('name', 'Tariq Plumber')
      .field('email', 'tariq@test.com')
      .field('phone', '01099998888')
      .field('password', 'password123')
      .field('role', 'handyman')
      .field('profession', 'سباك')
      .field('price', '160');

    const createdUser = await User.findOne({ email: 'tariq@test.com' });
    const createdHandyman = await Handyman.findOne({ userId: createdUser._id });

    // Admin approves registration
    const approveRes = await request(server)
      .patch(`/api/admin/approve-registration/${createdHandyman._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'تم التحقق من الأوراق والموافقة' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.success).toBe(true);

    // Verify status = approved
    const updatedUser = await User.findOne({ email: 'tariq@test.com' });
    expect(updatedUser.status).toBe('approved');
    expect(updatedUser.isVerified).toBe(true);

    const updatedHandyman = await Handyman.findOne({ userId: createdUser._id });
    expect(updatedHandyman.registrationStatus).toBe('approved');
    expect(updatedHandyman.verified).toBe(false);

    // Attempt login with approved account
    const loginRes = await request(server)
      .post('/api/users/login')
      .send({
        email: 'tariq@test.com',
        password: 'password123',
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeTruthy();
    expect(loginRes.body.user).toBeTruthy();
    expect(loginRes.body.user.email).toBe('tariq@test.com');
  });
});
