const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Handyman = require('../models/Handyman');

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

describe('Handyman Public Endpoints - Fix 4 Acceptance Tests', () => {
  it('Fix 4: getNearbyHandymen does not return email or phone', async () => {
    const user = await User.create({
      name: 'Public Handyman',
      email: 'secret_email@test.com',
      password: 'Password123!',
      role: 'handyman',
      isVerified: true,
      phone: '+20000000001',
      location: { type: 'Point', coordinates: [30.0, 31.0] }
    });

    await Handyman.create({
      userId: user._id,
      profession: 'plumbing',
      price: 100,
      registrationStatus: 'approved',
      isSuspended: false,
      isAvailable: true
    });

    const res = await request(app).get('/api/handymen/nearby?lat=31.0&lng=30.0&radius=5000000');
    expect(res.statusCode).toBe(200);
    expect(res.body.handymen.length).toBe(1);
    
    const h = res.body.handymen[0];
    expect(h.name).toBe('Public Handyman');
    expect(h.email).toBeUndefined();
    expect(h.phone).toBeUndefined();
  });

  it('Fix 4: getHandymanDetails does not return email or phone', async () => {
    const user = await User.create({
      name: 'Public Handyman 2',
      email: 'secret_email2@test.com',
      password: 'Password123!',
      role: 'handyman',
      isVerified: true,
      phone: '+20000000002',
      location: { type: 'Point', coordinates: [30.0, 31.0] }
    });

    await Handyman.create({
      userId: user._id,
      profession: 'electrical',
      price: 150,
      registrationStatus: 'approved',
      isSuspended: false,
      isAvailable: true
    });

    const res = await request(app).get(`/api/handymen/${user._id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Public Handyman 2');
    expect(res.body.email).toBeUndefined();
    expect(res.body.phone).toBeUndefined();
  });
});
