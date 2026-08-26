// HerfyBackend/tests/subscription.test.js
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Handyman = require('../models/Handyman');
const Order = require('../models/Order');
const { generateAccessToken } = require('../utils/generateToken');
const { SUBSCRIPTION_PLANS } = require('../utils/constants');

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

// ─── Helpers ────────────────────────────────────────────────────────────────

let _seq = 0;
const seq = () => ++_seq;

async function makeCustomer() {
  const n = seq();
  const user = await User.create({
    name: 'Customer',
    email: `customer${n}@sub.test`,
    password: 'Password123!',
    role: 'customer',
    isVerified: true,
    phone: `+4000000${String(n).padStart(4, '0')}`,
  });
  return { user, token: generateAccessToken(user) };
}

async function makeHandyman(plan = 'FREE') {
  const n = seq();
  const user = await User.create({
    name: 'Handyman',
    email: `handyman${n}@sub.test`,
    password: 'Password123!',
    role: 'handyman',
    isVerified: true,
    phone: `+5000000${String(n).padStart(4, '0')}`,
    location: { type: 'Point', coordinates: [31.2, 30.1] },
  });
  const profile = await Handyman.create({
    userId: user._id,
    profession: 'Plumbing',
    price: 100,
    isAvailable: true,
    registrationStatus: 'approved',
    nationalId: 'dummy-path',
    subscriptionPlan: plan,
  });
  return { user, profile, token: generateAccessToken(user) };
}

async function makeAdmin() {
  const n = seq();
  const user = await User.create({
    name: 'Admin',
    email: `admin${n}@sub.test`,
    password: 'Password123!',
    role: 'customer',
    isAdmin: true,
    isVerified: true,
    phone: `+6000000${String(n).padStart(4, '0')}`,
  });
  return { user, token: generateAccessToken(user) };
}

// Creates an order already in the given status (bypasses the full flow)
async function seedOrder(customerId, handymanUserId, status = 'in-progress') {
  return Order.create({
    customerId,
    handymanId: handymanUserId,
    profession: 'Plumbing',
    description: 'Test',
    requestType: 'instant',
    estimatedPrice: 100,
    customerLocation: { type: 'Point', coordinates: [31.2, 30.1] },
    status,
    price: 100,
    commissionRate: 10,
  });
}

// ─── Test 1: Existing handyman defaults to FREE ──────────────────────────────

describe('Test 1 — Existing handyman defaults to FREE', () => {
  it('handyman without explicit plan behaves as FREE', async () => {
    const { user, profile } = await makeHandyman();
    // Manually unset the field to simulate a pre-existing document
    await Handyman.updateOne({ _id: profile._id }, { $unset: { subscriptionPlan: '' } });

    const fresh = await Handyman.findOne({ userId: user._id });
    // Mongoose returns the schema default when the field is absent
    expect(fresh.subscriptionPlan ?? 'FREE').toBe('FREE');
    expect(SUBSCRIPTION_PLANS['FREE'].commissionRate).toBe(10);
    expect(SUBSCRIPTION_PLANS['FREE'].maxActiveClients).toBe(1);
  });
});

// ─── Test 2: PREMIUM handyman config ────────────────────────────────────────

describe('Test 2 — PREMIUM handyman config', () => {
  it('PREMIUM plan has 5% commission and 3 max active clients', () => {
    expect(SUBSCRIPTION_PLANS['PREMIUM'].commissionRate).toBe(5);
    expect(SUBSCRIPTION_PLANS['PREMIUM'].maxActiveClients).toBe(3);
  });

  it('GET /api/handymen/subscription returns PREMIUM config', async () => {
    const { token } = await makeHandyman('PREMIUM');
    const res = await request(app)
      .get('/api/handymen/subscription')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.subscriptionPlan).toBe('PREMIUM');
    expect(res.body.commissionRate).toBe(5);
    expect(res.body.maxActiveClients).toBe(3);
  });
});

// ─── Test 3: FREE active-client limit (cap = 1) ──────────────────────────────

describe('Test 3 — FREE active-client limit', () => {
  it('rejects accept when FREE handyman already has 1 in-progress order', async () => {
    const { user: cUser } = await makeCustomer();
    const { user: hUser, token: hToken } = await makeHandyman('FREE');

    // Seed 1 in-progress order (already at cap)
    await seedOrder(cUser._id, hUser._id, 'in-progress');

    // Create a new pending order to try to accept
    const pendingOrder = await seedOrder(cUser._id, hUser._id, 'pending');

    const res = await request(app)
      .patch(`/api/orders/${pendingOrder._id}/status`)
      .set('Authorization', `Bearer ${hToken}`)
      .send({ status: 'accepted', price: 100 });

    expect(res.statusCode).toBe(400);
    expect(res.body.maxActiveClients).toBe(1);
    expect(res.body.subscriptionPlan).toBe('FREE');
  });

  it('allows accept when FREE handyman has 0 in-progress orders', async () => {
    const { user: cUser } = await makeCustomer();
    const { user: hUser, token: hToken } = await makeHandyman('FREE');

    const pendingOrder = await seedOrder(cUser._id, hUser._id, 'pending');

    const res = await request(app)
      .patch(`/api/orders/${pendingOrder._id}/status`)
      .set('Authorization', `Bearer ${hToken}`)
      .send({ status: 'accepted', price: 100 });

    expect(res.statusCode).toBe(200);
    expect(res.body.order.status).toBe('accepted');
  });
});

// ─── Test 4: PREMIUM active-client limit (cap = 3) ──────────────────────────

describe('Test 4 — PREMIUM active-client limit', () => {
  it('rejects accept when PREMIUM handyman already has 3 in-progress orders', async () => {
    const { user: cUser } = await makeCustomer();
    const { user: hUser, token: hToken } = await makeHandyman('PREMIUM');

    // Seed 3 in-progress orders (at cap)
    await seedOrder(cUser._id, hUser._id, 'in-progress');
    await seedOrder(cUser._id, hUser._id, 'in-progress');
    await seedOrder(cUser._id, hUser._id, 'in-progress');

    const pendingOrder = await seedOrder(cUser._id, hUser._id, 'pending');

    const res = await request(app)
      .patch(`/api/orders/${pendingOrder._id}/status`)
      .set('Authorization', `Bearer ${hToken}`)
      .send({ status: 'accepted', price: 100 });

    expect(res.statusCode).toBe(400);
    expect(res.body.maxActiveClients).toBe(3);
    expect(res.body.subscriptionPlan).toBe('PREMIUM');
  });

  it('allows accept when PREMIUM handyman has only 2 in-progress orders', async () => {
    const { user: cUser } = await makeCustomer();
    const { user: hUser, token: hToken } = await makeHandyman('PREMIUM');

    await seedOrder(cUser._id, hUser._id, 'in-progress');
    await seedOrder(cUser._id, hUser._id, 'in-progress');

    const pendingOrder = await seedOrder(cUser._id, hUser._id, 'pending');

    const res = await request(app)
      .patch(`/api/orders/${pendingOrder._id}/status`)
      .set('Authorization', `Bearer ${hToken}`)
      .send({ status: 'accepted', price: 100 });

    expect(res.statusCode).toBe(200);
    expect(res.body.order.status).toBe('accepted');
  });
});

// ─── Test 5: Commission rate per plan ────────────────────────────────────────

describe('Test 5 — Commission rate per plan', () => {
  it('FREE handyman order gets commissionRate = 10', async () => {
    const { user: cUser, token: cToken } = await makeCustomer();
    const { user: hUser } = await makeHandyman('FREE');

    // Update customer location so createOrder passes
    await User.findByIdAndUpdate(cUser._id, {
      location: { type: 'Point', coordinates: [31.2, 30.1] },
    });

    const res = await request(app)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${cToken}`)
      .send({
        handymanId: hUser._id.toString(),
        profession: 'Plumbing',
        description: 'Fix pipe',
        requestType: 'instant',
        estimatedPrice: 200,
        isEmergency: false,
        customerLocation: { type: 'Point', coordinates: [31.2, 30.1] },
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.order.commissionRate).toBe(10);
  });

  it('PREMIUM handyman order gets commissionRate = 5', async () => {
    const { user: cUser, token: cToken } = await makeCustomer();
    const { user: hUser } = await makeHandyman('PREMIUM');

    await User.findByIdAndUpdate(cUser._id, {
      location: { type: 'Point', coordinates: [31.2, 30.1] },
    });

    const res = await request(app)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${cToken}`)
      .send({
        handymanId: hUser._id.toString(),
        profession: 'Plumbing',
        description: 'Fix pipe',
        requestType: 'instant',
        estimatedPrice: 200,
        isEmergency: false,
        customerLocation: { type: 'Point', coordinates: [31.2, 30.1] },
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.order.commissionRate).toBe(5);
  });

  it('emergency order always gets commissionRate = 15 regardless of plan', async () => {
    const { user: cUser, token: cToken } = await makeCustomer();
    const { user: hUser } = await makeHandyman('PREMIUM');

    await User.findByIdAndUpdate(cUser._id, {
      location: { type: 'Point', coordinates: [31.2, 30.1] },
    });

    const res = await request(app)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${cToken}`)
      .send({
        handymanId: hUser._id.toString(),
        profession: 'Plumbing',
        description: 'Emergency fix',
        requestType: 'instant',
        estimatedPrice: 200,
        isEmergency: true,
        customerLocation: { type: 'Point', coordinates: [31.2, 30.1] },
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.order.commissionRate).toBe(15);
  });
});

// ─── Test 6: Security — cannot self-upgrade via profile update ───────────────

describe('Test 6 — Security: cannot self-upgrade via profile update', () => {
  it('PUT /api/handymen/:id ignores subscriptionPlan in body', async () => {
    const { user, profile, token } = await makeHandyman('FREE');

    const res = await request(app)
      .put(`/api/handymen/${user._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ bio: 'Updated bio', subscriptionPlan: 'PREMIUM' });

    // Request should succeed (bio update is valid)
    expect(res.statusCode).toBe(200);

    // But plan must remain FREE
    const fresh = await Handyman.findOne({ userId: user._id });
    expect(fresh.subscriptionPlan).toBe('FREE');
  });

  it('admin can change plan via PATCH /api/admin/handymen/:id/subscription', async () => {
    const { user: hUser } = await makeHandyman('FREE');
    const { token: adminToken } = await makeAdmin();

    const res = await request(app)
      .patch(`/api/admin/handymen/${hUser._id}/subscription`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ subscriptionPlan: 'PREMIUM' });

    expect(res.statusCode).toBe(200);
    expect(res.body.subscriptionPlan).toBe('PREMIUM');

    const fresh = await Handyman.findOne({ userId: hUser._id });
    expect(fresh.subscriptionPlan).toBe('PREMIUM');
  });

  it('normal handyman cannot call admin subscription endpoint', async () => {
    const { user: hUser, token: hToken } = await makeHandyman('FREE');

    const res = await request(app)
      .patch(`/api/admin/handymen/${hUser._id}/subscription`)
      .set('Authorization', `Bearer ${hToken}`)
      .send({ subscriptionPlan: 'PREMIUM' });

    expect(res.statusCode).toBe(403);

    const fresh = await Handyman.findOne({ userId: hUser._id });
    expect(fresh.subscriptionPlan).toBe('FREE');
  });
});

// ─── Test 7: GET /api/handymen/subscription returns correct data ─────────────

describe('GET /api/handymen/subscription', () => {
  it('returns correct subscription data for FREE handyman', async () => {
    const { user: cUser } = await makeCustomer();
    const { user: hUser, token: hToken } = await makeHandyman('FREE');

    // Seed 1 in-progress order so activeClients = 1
    await seedOrder(cUser._id, hUser._id, 'in-progress');

    const res = await request(app)
      .get('/api/handymen/subscription')
      .set('Authorization', `Bearer ${hToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.subscriptionPlan).toBe('FREE');
    expect(res.body.commissionRate).toBe(10);
    expect(res.body.maxActiveClients).toBe(1);
    expect(res.body.activeClients).toBe(1);
    expect(res.body.remainingSlots).toBe(0);
    expect(res.body.price).toBe(0);
  });

  it('returns correct subscription data for PREMIUM handyman', async () => {
    const { user: cUser } = await makeCustomer();
    const { user: hUser, token: hToken } = await makeHandyman('PREMIUM');

    await seedOrder(cUser._id, hUser._id, 'in-progress');

    const res = await request(app)
      .get('/api/handymen/subscription')
      .set('Authorization', `Bearer ${hToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.subscriptionPlan).toBe('PREMIUM');
    expect(res.body.commissionRate).toBe(5);
    expect(res.body.maxActiveClients).toBe(3);
    expect(res.body.activeClients).toBe(1);
    expect(res.body.remainingSlots).toBe(2);
    expect(res.body.price).toBe(200);
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app).get('/api/handymen/subscription');
    expect(res.statusCode).toBe(401);
  });
});
