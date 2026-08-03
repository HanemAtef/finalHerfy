const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Handyman = require('../models/Handyman');
const Order = require('../models/Order');
const { generateAccessToken } = require('../utils/generateToken');

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

async function makeCustomer() {
  const user = await User.create({
    name: 'Customer',
    email: 'customer@idem.test',
    password: 'Password123!',
    role: 'customer',
    isVerified: true,
    phone: '+40000000001',
  });
  return { user, token: generateAccessToken(user) };
}

async function makeHandyman() {
  const user = await User.create({
    name: 'Handyman',
    email: 'handyman@idem.test',
    password: 'Password123!',
    role: 'handyman',
    isVerified: true,
    phone: '+40000000002',
    location: { type: 'Point', coordinates: [31.2, 30.1] },
  });
  await Handyman.create({
    userId: user._id,
    profession: 'Plumbing',
    price: 100,
    isAvailable: true,
    registrationStatus: 'approved',
    nationalId: 'dummy-path',
  });
  return { user, token: generateAccessToken(user) };
}

describe('Idempotency — order creation', () => {
  it('returns the same response and creates only one order when the same key is sent twice', async () => {
    const { token: cToken } = await makeCustomer();
    const { user: hUser } = await makeHandyman();
    const idempotencyKey = `test-key-${Date.now()}`;

    const payload = {
      handymanId: hUser._id.toString(),
      profession: 'Plumbing',
      description: 'Fix pipe',
      requestType: 'instant',
      estimatedPrice: 100,
      customerLocation: { type: 'Point', coordinates: [31.2, 30.1] },
    };

    const res1 = await request(app)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${cToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res1.statusCode).toBe(201);

    const res2 = await request(app)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${cToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res2.statusCode).toBe(201);
    // Same order ID returned both times
    expect(res2.body.order._id).toBe(res1.body.order._id);

    // Only one order document in DB
    const count = await Order.countDocuments({});
    expect(count).toBe(1);
  });

  it('creates two separate orders when different idempotency keys are used', async () => {
    const { token: cToken } = await makeCustomer();
    const { user: hUser } = await makeHandyman();

    const payload = {
      handymanId: hUser._id.toString(),
      profession: 'Plumbing',
      description: 'Fix pipe',
      requestType: 'instant',
      estimatedPrice: 100,
      customerLocation: { type: 'Point', coordinates: [31.2, 30.1] },
    };

    await request(app)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${cToken}`)
      .set('Idempotency-Key', `key-a-${Date.now()}`)
      .send(payload);

    // Make handyman available again for second order
    await Handyman.updateOne({ userId: hUser._id }, { isAvailable: true });

    await request(app)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${cToken}`)
      .set('Idempotency-Key', `key-b-${Date.now()}`)
      .send(payload);

    const count = await Order.countDocuments({});
    expect(count).toBe(2);
  });
});
