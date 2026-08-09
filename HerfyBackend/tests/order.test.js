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

// ── helpers ──────────────────────────────────────────────────────────────────

let _seq = 0;
function seq() { return ++_seq; }

async function makeCustomer() {
  const n = seq();
  const user = await User.create({
    name: 'Customer',
    email: `customer${n}@order.test`,
    password: 'Password123!',
    role: 'customer',
    isVerified: true,
    phone: `+2000000${String(n).padStart(4,'0')}`,
  });
  return { user, token: generateAccessToken(user) };
}

async function makeHandyman() {
  const n = seq();
  const user = await User.create({
    name: 'Handyman',
    email: `handyman${n}@order.test`,
    password: 'Password123!',
    role: 'handyman',
    isVerified: true,
    phone: `+3000000${String(n).padStart(4,'0')}`,
    location: { type: 'Point', coordinates: [31.2, 30.1] },
  });
  const profile = await Handyman.create({
    userId: user._id,
    profession: 'Plumbing',
    price: 100,
    isAvailable: true,
    registrationStatus: 'approved',
    nationalId: 'dummy-path',
  });
  return { user, profile, token: generateAccessToken(user) };
}

async function createOrder(customerToken, handymanId) {
  return request(app)
    .post('/api/orders/create')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({
      handymanId,
      profession: 'Plumbing',
      description: 'Fix pipe',
      requestType: 'instant',
      estimatedPrice: 100,
      customerLocation: { type: 'Point', coordinates: [31.2, 30.1] },
    });
}

// Advance an order through the lifecycle up to targetStatus
async function advanceTo(targetStatus) {
  const { user: cUser, token: cToken } = await makeCustomer();
  const { user: hUser, token: hToken } = await makeHandyman();

  const orderRes = await createOrder(cToken, hUser._id.toString());
  const orderId = orderRes.body.order._id;

  if (targetStatus === 'pending') return { orderId, cToken, hToken, cUser, hUser };

  await request(app)
    .patch(`/api/orders/${orderId}/status`)
    .set('Authorization', `Bearer ${hToken}`)
    .send({ status: 'accepted', price: 150 });
  if (targetStatus === 'accepted') return { orderId, cToken, hToken, cUser, hUser };

  await request(app)
    .patch(`/api/orders/${orderId}/confirm-price`)
    .set('Authorization', `Bearer ${cToken}`)
    .send({ confirmed: true });
  if (targetStatus === 'price_confirmed') return { orderId, cToken, hToken, cUser, hUser };

  await request(app)
    .patch(`/api/orders/${orderId}/status`)
    .set('Authorization', `Bearer ${hToken}`)
    .send({ status: 'in-progress' });
  if (targetStatus === 'in-progress') return { orderId, cToken, hToken, cUser, hUser };

  await request(app)
    .patch(`/api/orders/${orderId}/status`)
    .set('Authorization', `Bearer ${hToken}`)
    .send({ status: 'completed', completionImage: 'https://example.com/proof.jpg' });
  return { orderId, cToken, hToken, cUser, hUser };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('Order — create', () => {
  it('creates an order successfully', async () => {
    const { token: cToken } = await makeCustomer();
    const { user: hUser } = await makeHandyman();
    const res = await createOrder(cToken, hUser._id.toString());
    expect(res.statusCode).toBe(201);
    expect(res.body.order.status).toBe('pending');
  });

  it('rejects order for unavailable handyman', async () => {
    const { token: cToken } = await makeCustomer();
    const { user: hUser, profile } = await makeHandyman();
    profile.isAvailable = false;
    await profile.save();
    const res = await createOrder(cToken, hUser._id.toString());
    expect(res.statusCode).toBe(400);
  });

  it('rejects order when customer has 3+ penalties', async () => {
    const { user: cUser } = await makeCustomer();
    cUser.penaltyCount = 3;
    await cUser.save();
    const token = generateAccessToken(cUser);
    const { user: hUser } = await makeHandyman();
    const res = await createOrder(token, hUser._id.toString());
    expect(res.statusCode).toBe(403);
  });
});

describe('Order — handyman accepts', () => {
  it('handyman can accept a pending order', async () => {
    const { orderId, hToken } = await advanceTo('pending');
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${hToken}`)
      .send({ status: 'accepted' });
    expect(res.statusCode).toBe(200);
    expect(res.body.order.status).toBe('accepted');
  });

  it('customer cannot accept an order', async () => {
    const { orderId, cToken } = await advanceTo('pending');
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${cToken}`)
      .send({ status: 'accepted' });
    expect(res.statusCode).toBe(403);
  });
});

describe('Order — price confirmation', () => {
  it('customer confirms price → status becomes price_confirmed', async () => {
    const { orderId, cToken } = await advanceTo('accepted');
    const res = await request(app)
      .patch(`/api/orders/${orderId}/confirm-price`)
      .set('Authorization', `Bearer ${cToken}`)
      .send({ confirmed: true });
    expect(res.statusCode).toBe(200);
    expect(res.body.order.status).toBe('price_confirmed');
  });

  it('non-customer cannot confirm price', async () => {
    const { orderId, hToken } = await advanceTo('accepted');
    const res = await request(app)
      .patch(`/api/orders/${orderId}/confirm-price`)
      .set('Authorization', `Bearer ${hToken}`)
      .send({ confirmed: true });
    expect(res.statusCode).toBe(403);
  });
});

describe('Order — status transitions', () => {
  it('full lifecycle: pending → accepted → price_confirmed → in-progress → completed', async () => {
    const { orderId, hToken } = await advanceTo('in-progress');
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${hToken}`)
      .send({ status: 'completed', completionImage: 'https://example.com/proof.jpg' });
    expect(res.statusCode).toBe(200);
    expect(res.body.order.status).toBe('completed');
  });

  it('invalid transition: pending → completed is rejected', async () => {
    const { orderId, hToken } = await advanceTo('pending');
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${hToken}`)
      .send({ status: 'completed', completionImage: 'https://example.com/proof.jpg' });
    expect(res.statusCode).toBe(400);
  });

  it('invalid transition: accepted → in-progress (skipping price_confirmed) is rejected', async () => {
    const { orderId, hToken } = await advanceTo('accepted');
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${hToken}`)
      .send({ status: 'in-progress' });
    expect(res.statusCode).toBe(400);
  });

  it('cannot update a completed order', async () => {
    const { orderId, hToken } = await advanceTo('completed');
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${hToken}`)
      .send({ status: 'cancelled' });
    expect(res.statusCode).toBe(400);
  });
});

describe('Order — cancellation penalty', () => {
  it('customer cancelling in-progress order incurs penalty', async () => {
    const { orderId, cToken, cUser } = await advanceTo('in-progress');

    await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${cToken}`)
      .send({ status: 'cancelled' });

    const updatedCustomer = await User.findById(cUser._id);
    expect(updatedCustomer.penaltyCount).toBe(1);
    expect(updatedCustomer.penaltyAmount).toBe(50);
  });
});
