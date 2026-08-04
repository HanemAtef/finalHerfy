// HerfyBackend/tests/cancellation.test.js
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

let _seq = 0;
const seq = () => ++_seq;

async function makeCustomer() {
  const n = seq();
  const user = await User.create({
    name: 'Customer',
    email: `customer${n}@cancel.test`,
    password: 'Password123!',
    role: 'customer',
    isVerified: true,
    phone: `+200000${String(n).padStart(5, '0')}`,
  });
  return { user, token: generateAccessToken(user) };
}

async function makeHandyman() {
  const n = seq();
  const user = await User.create({
    name: 'Handyman',
    email: `handyman${n}@cancel.test`,
    password: 'Password123!',
    role: 'handyman',
    isVerified: true,
    phone: `+300000${String(n).padStart(5, '0')}`,
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

// Advance order to price_confirmed state — creates order directly in DB
// to bypass the customer suspension check on the 4th+ iteration
async function makeConfirmedOrder(cUser, hUser, hToken) {
  const order = await Order.create({
    customerId: cUser._id,
    handymanId: hUser._id,
    profession: 'Plumbing',
    description: 'Fix pipe',
    requestType: 'instant',
    estimatedPrice: 100,
    totalPrice: 100,
    customerLocation: { type: 'Point', coordinates: [31.2, 30.1] },
    status: 'price_confirmed',
    commissionRate: 10,
  });
  return order._id.toString();
}

async function cancelOrder(orderId, token) {
  return request(app)
    .patch(`/api/orders/${orderId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'cancelled' });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Cancellation limit — pre-confirmation cancellations never count', () => {
  it('cancelling a pending order does not increment monthly counter', async () => {
    const { user: cUser, token: cToken } = await makeCustomer();
    const { user: hUser, token: hToken } = await makeHandyman();

    // Create and immediately cancel (still pending — no price confirmed)
    const orderRes = await request(app)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${cToken}`)
      .send({
        handymanId: hUser._id.toString(),
        profession: 'Plumbing',
        description: 'Fix pipe',
        requestType: 'instant',
        estimatedPrice: 100,
        customerLocation: { type: 'Point', coordinates: [31.2, 30.1] },
      });
    const orderId = orderRes.body.order._id;

    await cancelOrder(orderId, cToken);

    const updated = await User.findById(cUser._id);
    expect(updated.monthlyCancellationCount).toBe(0);
    expect(updated.isSuspendedPendingReview).toBe(false);
  });

  it('cancelling an accepted order (before price_confirmed) does not count', async () => {
    const { user: cUser, token: cToken } = await makeCustomer();
    const { user: hUser, token: hToken } = await makeHandyman();

    const orderRes = await request(app)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${cToken}`)
      .send({
        handymanId: hUser._id.toString(),
        profession: 'Plumbing',
        description: 'Fix pipe',
        requestType: 'instant',
        estimatedPrice: 100,
        customerLocation: { type: 'Point', coordinates: [31.2, 30.1] },
      });
    const orderId = orderRes.body.order._id;

    await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${hToken}`)
      .send({ status: 'accepted', price: 150 });

    await cancelOrder(orderId, cToken);

    const updated = await User.findById(cUser._id);
    expect(updated.monthlyCancellationCount).toBe(0);
    expect(updated.isSuspendedPendingReview).toBe(false);
  });
});

describe('Cancellation limit — 3 post-confirmation cancellations allowed', () => {
  it('3 post-confirmation cancellations in a month: no suspension', async () => {
    const { user: cUser, token: cToken } = await makeCustomer();
    const { user: hUser, token: hToken } = await makeHandyman();

    for (let i = 0; i < 3; i++) {
      const orderId = await makeConfirmedOrder(cUser, hUser, hToken);
      await cancelOrder(orderId, cToken);
    }

    const updated = await User.findById(cUser._id);
    expect(updated.monthlyCancellationCount).toBe(3);
    expect(updated.isSuspendedPendingReview).toBe(false);
  });
});

describe('Cancellation limit — 4th post-confirmation cancellation triggers suspension', () => {
  it('4th post-confirmation cancellation sets isSuspendedPendingReview=true', async () => {
    const { user: cUser, token: cToken } = await makeCustomer();
    const { user: hUser, token: hToken } = await makeHandyman();

    for (let i = 0; i < 4; i++) {
      const orderId = await makeConfirmedOrder(cUser, hUser, hToken);
      await cancelOrder(orderId, cToken);
    }

    const updated = await User.findById(cUser._id);
    expect(updated.monthlyCancellationCount).toBe(4);
    expect(updated.isSuspendedPendingReview).toBe(true);
    expect(updated.suspendedPendingReviewReason).toBeTruthy();
  });

  it('suspended customer cannot create new orders', async () => {
    const { user: cUser, token: cToken } = await makeCustomer();
    const { user: hUser, token: hToken } = await makeHandyman();

    for (let i = 0; i < 4; i++) {
      const orderId = await makeConfirmedOrder(cUser, hUser, hToken);
      await cancelOrder(orderId, cToken);
    }

    const res = await request(app)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${cToken}`)
      .send({
        handymanId: hUser._id.toString(),
        profession: 'Plumbing',
        description: 'Fix pipe',
        requestType: 'instant',
        estimatedPrice: 100,
        customerLocation: { type: 'Point', coordinates: [31.2, 30.1] },
      });

    expect(res.statusCode).toBe(403);
    expect(res.body.suspendedPendingReview).toBe(true);
  });
});

describe('Cancellation limit — monthly reset clears suspension', () => {
  it('counter and suspension reset when month changes', async () => {
    const { user: cUser, token: cToken } = await makeCustomer();
    const { user: hUser, token: hToken } = await makeHandyman();

    for (let i = 0; i < 4; i++) {
      const orderId = await makeConfirmedOrder(cUser, hUser, hToken);
      await cancelOrder(orderId, cToken);
    }

    let updated = await User.findById(cUser._id);
    expect(updated.isSuspendedPendingReview).toBe(true);

    // Simulate new month by rolling back the stored month
    const prevMonth = updated.monthlyCancellationMonth === 0 ? 11 : updated.monthlyCancellationMonth - 1;
    await User.updateOne({ _id: cUser._id }, {
      monthlyCancellationMonth: prevMonth,
      monthlyCancellationYear: prevMonth === 11
        ? updated.monthlyCancellationYear - 1
        : updated.monthlyCancellationYear,
    });

    // Next post-confirmation cancellation should reset counter and lift suspension
    const orderId = await makeConfirmedOrder(cUser, hUser, hToken);
    await cancelOrder(orderId, cToken);

    updated = await User.findById(cUser._id);
    expect(updated.monthlyCancellationCount).toBe(1);
    expect(updated.isSuspendedPendingReview).toBe(false);
  });
});
