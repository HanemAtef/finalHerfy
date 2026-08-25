// tests/cancellation.test.js
// Comprehensive tests for cancellation, progressive penalties, settlement,
// and order-creation blocking.

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Handyman = require('../models/Handyman');
const Order = require('../models/Order');

// Mock stripe SDK (same pattern as payment.test.js)
jest.mock('../config/stripe', () => {
  const mockRetrieve = jest.fn();
  const mockCreate = jest.fn();
  return {
    paymentIntents: {
      retrieve: mockRetrieve,
      create: mockCreate,
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
    __mockRetrieve: mockRetrieve,
    __mockCreate: mockCreate,
  };
});

// Mock TomTom to avoid network calls during order creation
jest.mock('../utils/tomtom', () => ({
  calculateRoute: jest.fn().mockResolvedValue({
    route: { summary: { travelTimeInSeconds: 600, lengthInMeters: 5000 } },
  }),
}));

const server = require('../app');
const stripeMock = require('../config/stripe');

// ---------------------------------------------------------------------------
// MongoDB Memory Server Setup
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET;

async function makeCustomer(suffix = '') {
  const user = await User.create({
    name: `Customer${suffix}`,
    email: `customer${suffix}@test.com`,
    phone: `0100000000${suffix.slice(-4).padStart(4, '0')}`,
    password: 'password123',
    role: 'customer',
    isVerified: true,
    location: { type: 'Point', coordinates: [31.236, 30.044] },
  });
  const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, {
    expiresIn: '1h', issuer: 'my-app', audience: 'my-users',
  });
  return { user, token };
}

async function makeHandyman(suffix = '') {
  const user = await User.create({
    name: `Handyman${suffix}`,
    email: `handyman${suffix}@test.com`,
    phone: `0110000000${suffix.slice(-4).padStart(4, '0')}`,
    password: 'password123',
    role: 'handyman',
    isVerified: true,
  });
  const handyman = await Handyman.create({
    userId: user._id,
    profession: 'plumber',
    price: 100,
    registrationStatus: 'approved',
    isAvailable: true,
  });
  const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, {
    expiresIn: '1h', issuer: 'my-app', audience: 'my-users',
  });
  return { user, handyman, token };
}

async function makeAdmin(suffix = '') {
  const user = await User.create({
    name: `Admin${suffix}`,
    email: `admin${suffix}@test.com`,
    phone: `0120000000${suffix.slice(-4).padStart(4, '0')}`,
    password: 'password123',
    role: 'customer',
    isAdmin: true,
    isVerified: true,
  });
  const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, {
    expiresIn: '1h', issuer: 'my-app', audience: 'my-users',
  });
  return { user, token };
}

// Create an order directly in DB at a given status
async function makeOrder(customerId, handymanId, status = 'price_confirmed', extra = {}) {
  return await Order.create({
    customerId,
    handymanId,
    profession: 'plumber',
    description: 'Fix sink',
    estimatedPrice: 150,
    serviceAmount: 200,
    penaltyAmount: 0,
    totalPrice: 200,
    price: 200,
    status,
    customerLocation: { type: 'Point', coordinates: [31.236, 30.044] },
    commissionRate: 10,
    commissionAmount: 20,
    netAmount: 180,
    completionImage: 'https://example.com/proof.jpg',
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// CUSTOMER CANCELLATION TESTS
// ---------------------------------------------------------------------------
describe('Customer Cancellation & Penalties', () => {
  test('1. Cancel pending → no penalty', async () => {
    const { user: customer, token: customerToken } = await makeCustomer('01');
    const { user: handyman } = await makeHandyman('01');
    const order = await makeOrder(customer._id, handyman._id, 'pending');

    const res = await request(server)
      .patch(`/api/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    const updated = await User.findById(customer._id);
    expect(updated.penaltyCount).toBe(0);
    expect(updated.penaltyAmount).toBe(0);
  });

  test('2. Cancel accepted (before price confirmation) → no penalty', async () => {
    const { user: customer, token: customerToken } = await makeCustomer('02');
    const { user: handyman } = await makeHandyman('02');
    const order = await makeOrder(customer._id, handyman._id, 'accepted');

    const res = await request(server)
      .patch(`/api/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    const updated = await User.findById(customer._id);
    expect(updated.penaltyCount).toBe(0);
    expect(updated.penaltyAmount).toBe(0);
  });

  test('3. Cancel price_confirmed → penalty = 50 (first)', async () => {
    const { user: customer, token: customerToken } = await makeCustomer('03');
    const { user: handyman } = await makeHandyman('03');
    const order = await makeOrder(customer._id, handyman._id, 'price_confirmed');

    const res = await request(server)
      .patch(`/api/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    const updated = await User.findById(customer._id);
    expect(updated.penaltyCount).toBe(1);
    expect(updated.penaltyAmount).toBe(50);
  });

  test('4. Cancel in-progress → penalty = 50 (first)', async () => {
    const { user: customer, token: customerToken } = await makeCustomer('04');
    const { user: handyman } = await makeHandyman('04');
    const order = await makeOrder(customer._id, handyman._id, 'in-progress');

    const res = await request(server)
      .patch(`/api/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    const updated = await User.findById(customer._id);
    expect(updated.penaltyCount).toBe(1);
    expect(updated.penaltyAmount).toBe(50);
  });

  test('5. Cancel arrived → penalty = 50 (first)', async () => {
    const { user: customer, token: customerToken } = await makeCustomer('05');
    const { user: handyman } = await makeHandyman('05');
    const order = await makeOrder(customer._id, handyman._id, 'arrived');

    const res = await request(server)
      .patch(`/api/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    const updated = await User.findById(customer._id);
    expect(updated.penaltyCount).toBe(1);
    expect(updated.penaltyAmount).toBe(50);
  });

  test('6. Cancel while trackingStatus = expired → no penalty', async () => {
    const { user: customer, token: customerToken } = await makeCustomer('06');
    const { user: handyman } = await makeHandyman('06');
    const order = await makeOrder(customer._id, handyman._id, 'in-progress', {
      trackingStatus: 'expired',
    });

    const res = await request(server)
      .patch(`/api/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    const updated = await User.findById(customer._id);
    expect(updated.penaltyCount).toBe(0);
    expect(updated.penaltyAmount).toBe(0);
  });

  test('7. Cannot cancel completed order', async () => {
    const { user: customer, token: customerToken } = await makeCustomer('07');
    const { user: handyman } = await makeHandyman('07');
    const order = await makeOrder(customer._id, handyman._id, 'completed');

    const res = await request(server)
      .patch(`/api/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PROGRESSIVE PENALTY TESTS
// ---------------------------------------------------------------------------
describe('Progressive Penalty (no accumulation)', () => {
  test('8. First penalized cancellation → penaltyCount=1, penaltyAmount=50', async () => {
    const { user: customer, token: customerToken } = await makeCustomer('08');
    const { user: handyman } = await makeHandyman('08');
    const order = await makeOrder(customer._id, handyman._id, 'price_confirmed');

    await request(server)
      .patch(`/api/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'cancelled' });

    const updated = await User.findById(customer._id);
    expect(updated.penaltyCount).toBe(1);
    expect(updated.penaltyAmount).toBe(50);
  });

  test('9. Second penalized cancellation → penaltyCount=2, penaltyAmount=60', async () => {
    const { user: customer, token: customerToken } = await makeCustomer('09');
    const { user: handyman } = await makeHandyman('09');

    // First cancellation
    const order1 = await makeOrder(customer._id, handyman._id, 'price_confirmed');
    await request(server)
      .patch(`/api/orders/${order1._id}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'cancelled' });

    // Second cancellation
    const order2 = await makeOrder(customer._id, handyman._id, 'in-progress');
    await request(server)
      .patch(`/api/orders/${order2._id}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'cancelled' });

    const updated = await User.findById(customer._id);
    expect(updated.penaltyCount).toBe(2);
    expect(updated.penaltyAmount).toBe(60); // 50 + 1*10, NOT 50+50=100
  });

  test('10. Third penalized cancellation → penaltyCount=3, penaltyAmount=70', async () => {
    const { user: customer, token: customerToken } = await makeCustomer('10');
    const { user: handyman } = await makeHandyman('10');

    for (let i = 0; i < 3; i++) {
      const order = await makeOrder(customer._id, handyman._id, 'price_confirmed');
      await request(server)
        .patch(`/api/orders/${order._id}/status`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'cancelled' });
    }

    const updated = await User.findById(customer._id);
    expect(updated.penaltyCount).toBe(3);
    expect(updated.penaltyAmount).toBe(70); // 50 + 2*10
  });

  test('11. Fourth penalized cancellation → penaltyCount=4, penaltyAmount=80', async () => {
    const { user: customer, token: customerToken } = await makeCustomer('11');
    const { user: handyman } = await makeHandyman('11');

    for (let i = 0; i < 4; i++) {
      const order = await makeOrder(customer._id, handyman._id, 'price_confirmed');
      await request(server)
        .patch(`/api/orders/${order._id}/status`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'cancelled' });
    }

    const updated = await User.findById(customer._id);
    expect(updated.penaltyCount).toBe(4);
    expect(updated.penaltyAmount).toBe(80); // 50 + 3*10
  });

  test('12. No accumulation: penalty is ASSIGNED not ADDED', async () => {
    const { user: customer, token: customerToken } = await makeCustomer('12');
    const { user: handyman } = await makeHandyman('12');

    // First cancellation → penaltyAmount = 50
    const order1 = await makeOrder(customer._id, handyman._id, 'price_confirmed');
    await request(server)
      .patch(`/api/orders/${order1._id}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'cancelled' });

    let updated = await User.findById(customer._id);
    expect(updated.penaltyAmount).toBe(50);

    // Second cancellation → penaltyAmount = 60, NOT 110
    const order2 = await makeOrder(customer._id, handyman._id, 'in-progress');
    await request(server)
      .patch(`/api/orders/${order2._id}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'cancelled' });

    updated = await User.findById(customer._id);
    expect(updated.penaltyAmount).toBe(60); // Not 50+60=110
  });
});

// ---------------------------------------------------------------------------
// ORDER CREATION BLOCKING TESTS
// ---------------------------------------------------------------------------
describe('Order Creation Blocking', () => {
  test('13. penaltyAmount > 0 blocks new order creation', async () => {
    const { user: customer, token: customerToken } = await makeCustomer('13');
    const { user: handyman } = await makeHandyman('13');

    // Give customer a penalty
    await User.findByIdAndUpdate(customer._id, { $set: { penaltyAmount: 50, penaltyCount: 1 } });

    const res = await request(server)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        handymanId: handyman._id,
        profession: 'plumber',
        description: 'Fix sink',
        estimatedPrice: 200,
        customerLocation: { coordinates: [31.236, 30.044] },
      });

    expect(res.status).toBe(403);
    expect(res.body.msg).toMatch(/outstanding penalty/i);
  });

  test('14. penaltyAmount = 0 allows order creation even with penaltyCount >= 3', async () => {
    const { user: customer, token: customerToken } = await makeCustomer('14');
    const { user: handyman } = await makeHandyman('14');

    // Customer has 3 penalties but all settled
    await User.findByIdAndUpdate(customer._id, { $set: { penaltyAmount: 0, penaltyCount: 3 } });

    const res = await request(server)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        handymanId: handyman._id,
        profession: 'plumber',
        description: 'Fix sink',
        estimatedPrice: 200,
        customerLocation: { coordinates: [31.236, 30.044] },
      });

    expect(res.status).toBe(201);
  });

  test('15. New order has penaltyAmount = 0 (no old penalty added)', async () => {
    const { user: customer, token: customerToken } = await makeCustomer('15');
    const { user: handyman } = await makeHandyman('15');

    const res = await request(server)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        handymanId: handyman._id,
        profession: 'plumber',
        description: 'Fix sink',
        estimatedPrice: 200,
        customerLocation: { coordinates: [31.236, 30.044] },
      });

    expect(res.status).toBe(201);
    expect(res.body.order.penaltyAmount).toBe(0);
    expect(res.body.order.serviceAmount).toBe(200);
    expect(res.body.order.totalPrice).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// PENALTY SETTLEMENT TESTS
// ---------------------------------------------------------------------------
describe('Penalty Settlement', () => {
  test('16. Stripe penalty settlement via webhook sets penaltyAmount = 0', async () => {
    const { user: customer } = await makeCustomer('16');
    await User.findByIdAndUpdate(customer._id, { $set: { penaltyAmount: 60, penaltyCount: 2 } });

    // Mock webhook event for penalty settlement
    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_penalty_16',
          metadata: { type: 'penalty_settlement', userId: customer._id.toString() },
        },
      },
    });

    const res = await request(server)
      .post('/api/webhooks/stripe')
      .set('stripe-signature', 'test_sig')
      .send({ id: 'pi_penalty_16' });

    expect(res.status).toBe(200);
    const updated = await User.findById(customer._id);
    expect(updated.penaltyAmount).toBe(0);
    expect(updated.penaltyCount).toBe(2); // NOT reset
  });

  test('17. Cash penalty settlement via admin sets penaltyAmount = 0', async () => {
    const { user: customer } = await makeCustomer('17');
    const { token: adminToken } = await makeAdmin('17');
    await User.findByIdAndUpdate(customer._id, { $set: { penaltyAmount: 70, penaltyCount: 3 } });

    const res = await request(server)
      .patch('/api/payments/penalty/confirm-cash')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerId: customer._id });

    expect(res.status).toBe(200);
    expect(res.body.penaltyAmount).toBe(0);
    expect(res.body.penaltyCount).toBe(3); // NOT reset
  });

  test('18. Successful payment does NOT reset penaltyCount', async () => {
    const { user: customer } = await makeCustomer('18');
    const { token: adminToken } = await makeAdmin('18');
    await User.findByIdAndUpdate(customer._id, { $set: { penaltyAmount: 50, penaltyCount: 1 } });

    await request(server)
      .patch('/api/payments/penalty/confirm-cash')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerId: customer._id });

    const updated = await User.findById(customer._id);
    expect(updated.penaltyCount).toBe(1);
    expect(updated.penaltyAmount).toBe(0);
  });

  test('19. Double cash settlement does NOT error (idempotent)', async () => {
    const { user: customer } = await makeCustomer('19');
    const { token: adminToken } = await makeAdmin('19');
    await User.findByIdAndUpdate(customer._id, { $set: { penaltyAmount: 50, penaltyCount: 1 } });

    // First settlement
    const res1 = await request(server)
      .patch('/api/payments/penalty/confirm-cash')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerId: customer._id });
    expect(res1.status).toBe(200);
    expect(res1.body.penaltyAmount).toBe(0);

    // Second settlement (duplicate)
    const res2 = await request(server)
      .patch('/api/payments/penalty/confirm-cash')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerId: customer._id });
    expect(res2.status).toBe(200);
    expect(res2.body.msg).toMatch(/already settled/i);

    const updated = await User.findById(customer._id);
    expect(updated.penaltyAmount).toBe(0);
  });

  test('20. Duplicate Stripe penalty webhook does NOT settle twice', async () => {
    const { user: customer } = await makeCustomer('20');
    await User.findByIdAndUpdate(customer._id, { $set: { penaltyAmount: 50, penaltyCount: 1 } });

    const mockEvent = {
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_penalty_dup_20',
          metadata: { type: 'penalty_settlement', userId: customer._id.toString() },
        },
      },
    };
    stripeMock.webhooks.constructEvent.mockReturnValue(mockEvent);

    // First webhook
    await request(server)
      .post('/api/webhooks/stripe')
      .set('stripe-signature', 'test_sig')
      .send({ id: 'pi_penalty_dup_20' });

    const after1 = await User.findById(customer._id);
    expect(after1.penaltyAmount).toBe(0);

    // Second webhook (duplicate)
    await request(server)
      .post('/api/webhooks/stripe')
      .set('stripe-signature', 'test_sig')
      .send({ id: 'pi_penalty_dup_20' });

    const after2 = await User.findById(customer._id);
    expect(after2.penaltyAmount).toBe(0); // Still 0, no error
  });

  test('21. penaltyAmount never becomes negative', async () => {
    const { user: customer } = await makeCustomer('21');
    const { token: adminToken } = await makeAdmin('21');
    // Set a very small penalty
    await User.findByIdAndUpdate(customer._id, { $set: { penaltyAmount: 1, penaltyCount: 1 } });

    await request(server)
      .patch('/api/payments/penalty/confirm-cash')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerId: customer._id });

    const updated = await User.findById(customer._id);
    expect(updated.penaltyAmount).toBe(0); // Not negative
  });

  test('22. After settlement, customer can create a new order', async () => {
    const { user: customer, token: customerToken } = await makeCustomer('22');
    const { user: handyman } = await makeHandyman('22');
    const { token: adminToken } = await makeAdmin('22');

    // Give penalty
    await User.findByIdAndUpdate(customer._id, { $set: { penaltyAmount: 50, penaltyCount: 1 } });

    // Blocked
    const blocked = await request(server)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        handymanId: handyman._id,
        profession: 'plumber',
        description: 'Fix sink',
        estimatedPrice: 200,
        customerLocation: { coordinates: [31.236, 30.044] },
      });
    expect(blocked.status).toBe(403);

    // Settle
    await request(server)
      .patch('/api/payments/penalty/confirm-cash')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerId: customer._id });

    // Now can create
    const allowed = await request(server)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        handymanId: handyman._id,
        profession: 'plumber',
        description: 'Fix sink',
        estimatedPrice: 200,
        customerLocation: { coordinates: [31.236, 30.044] },
      });
    expect(allowed.status).toBe(201);
  });

  test('23. Cash order payment settles legacy penalty on order', async () => {
    const { user: customer } = await makeCustomer('23');
    const { user: handyman, token: handymanToken } = await makeHandyman('23');

    // Legacy order with penalty
    const order = await makeOrder(customer._id, handyman._id, 'completed', {
      penaltyAmount: 50,
      paymentMethod: 'cash',
      paymentStatus: 'pending',
    });
    // Customer has outstanding penalty
    await User.findByIdAndUpdate(customer._id, { $set: { penaltyAmount: 50, penaltyCount: 1 } });

    await request(server)
      .patch(`/api/orders/${order._id}/confirm-payment`)
      .set('Authorization', `Bearer ${handymanToken}`);

    const updated = await User.findById(customer._id);
    expect(updated.penaltyAmount).toBe(0);
    expect(updated.penaltyCount).toBe(1); // Not reset
  });

  test('24. Stripe order payment settles legacy penalty via webhook', async () => {
    const { user: customer } = await makeCustomer('24');
    const { user: handyman } = await makeHandyman('24');

    const order = await makeOrder(customer._id, handyman._id, 'completed', {
      penaltyAmount: 50,
      stripePaymentIntentId: 'pi_order_penalty_24',
      paymentMethod: 'card',
      paymentStatus: 'pending',
    });
    await User.findByIdAndUpdate(customer._id, { $set: { penaltyAmount: 50, penaltyCount: 1 } });

    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_order_penalty_24' } }, // No metadata = order payment
    });

    await request(server)
      .post('/api/webhooks/stripe')
      .set('stripe-signature', 'test_sig')
      .send({ id: 'pi_order_penalty_24' });

    const updated = await User.findById(customer._id);
    expect(updated.penaltyAmount).toBe(0);
    expect(updated.penaltyCount).toBe(1);

    const updatedOrder = await Order.findById(order._id);
    expect(updatedOrder.paymentStatus).toBe('paid');
  });

  test('25. Penalty payment intent endpoint returns correct amount', async () => {
    const { user: customer, token: customerToken } = await makeCustomer('25');
    await User.findByIdAndUpdate(customer._id, { $set: { penaltyAmount: 70, penaltyCount: 3 } });

    stripeMock.__mockCreate.mockResolvedValue({
      id: 'pi_penalty_intent_25',
      client_secret: 'pi_penalty_intent_25_secret',
    });

    const res = await request(server)
      .post('/api/payments/penalty/create-intent')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.clientSecret).toBe('pi_penalty_intent_25_secret');
    expect(res.body.penaltyAmount).toBe(70);
    expect(res.body.penaltyCount).toBe(3);

    // Verify Stripe was called with correct amount and metadata
    const createCall = stripeMock.__mockCreate.mock.calls[stripeMock.__mockCreate.mock.calls.length - 1];
    expect(createCall[0].amount).toBe(7000); // 70 EGP * 100
    expect(createCall[0].currency).toBe('egp');
    expect(createCall[0].metadata.type).toBe('penalty_settlement');
    expect(createCall[0].metadata.userId).toBe(customer._id.toString());
  });

  test('26. Penalty intent endpoint rejects if no outstanding penalty', async () => {
    const { user: customer, token: customerToken } = await makeCustomer('26');
    // penaltyAmount defaults to 0

    const res = await request(server)
      .post('/api/payments/penalty/create-intent')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// HANDYMAN CANCELLATION TESTS
// ---------------------------------------------------------------------------
describe('Handyman Cancellation & Penalties', () => {
  test('27. Cancel pending → no penalty, no rating deduction', async () => {
    const { user: customer } = await makeCustomer('27');
    const { user: handyman, token: handymanToken, handyman: handymanProfile } = await makeHandyman('27');
    const order = await makeOrder(customer._id, handyman._id, 'pending');

    await request(server)
      .patch(`/api/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${handymanToken}`)
      .send({ status: 'cancelled' });

    const updatedHandyman = await Handyman.findById(handymanProfile._id);
    expect(updatedHandyman.rating).toBe(0); // No deduction
    expect(updatedHandyman.monthlyCancellationCount).toBe(0);
    expect(updatedHandyman.penaltyAmount).toBe(0);
  });

  test('28. Cancel accepted → no penalty, no rating deduction', async () => {
    const { user: customer } = await makeCustomer('28');
    const { user: handyman, token: handymanToken, handyman: handymanProfile } = await makeHandyman('28');
    const order = await makeOrder(customer._id, handyman._id, 'accepted');

    await request(server)
      .patch(`/api/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${handymanToken}`)
      .send({ status: 'cancelled' });

    const updatedHandyman = await Handyman.findById(handymanProfile._id);
    expect(updatedHandyman.rating).toBe(0);
    expect(updatedHandyman.monthlyCancellationCount).toBe(0);
    expect(updatedHandyman.penaltyAmount).toBe(0);
  });

  test('29. Cancel price_confirmed → rating -0.5, no financial penalty (1st)', async () => {
    const { user: customer } = await makeCustomer('29');
    const { user: handyman, token: handymanToken, handyman: handymanProfile } = await makeHandyman('29');
    // Set initial rating to 5.0
    await Handyman.findByIdAndUpdate(handymanProfile._id, { $set: { rating: 5.0 } });
    const order = await makeOrder(customer._id, handyman._id, 'price_confirmed');

    await request(server)
      .patch(`/api/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${handymanToken}`)
      .send({ status: 'cancelled' });

    const updatedHandyman = await Handyman.findById(handymanProfile._id);
    expect(updatedHandyman.rating).toBe(4.5); // 5.0 - 0.5
    expect(updatedHandyman.monthlyCancellationCount).toBe(1);
    expect(updatedHandyman.penaltyAmount).toBe(0); // No financial penalty for 1st
  });

  test('30. Cancel in-progress → rating -0.5 (2nd, no financial penalty)', async () => {
    const { user: customer } = await makeCustomer('30');
    const { user: handyman, token: handymanToken, handyman: handymanProfile } = await makeHandyman('30');
    await Handyman.findByIdAndUpdate(handymanProfile._id, { $set: { rating: 5.0, monthlyCancellationCount: 1 } });
    const order = await makeOrder(customer._id, handyman._id, 'in-progress');

    await request(server)
      .patch(`/api/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${handymanToken}`)
      .send({ status: 'cancelled' });

    const updatedHandyman = await Handyman.findById(handymanProfile._id);
    expect(updatedHandyman.rating).toBe(4.5);
    expect(updatedHandyman.monthlyCancellationCount).toBe(2);
    expect(updatedHandyman.penaltyAmount).toBe(0); // No financial penalty for 2nd
  });

  test('31. Cancel arrived → rating -0.5 (3rd → +50 EGP)', async () => {
    const { user: customer } = await makeCustomer('31');
    const { user: handyman, token: handymanToken, handyman: handymanProfile } = await makeHandyman('31');
    await Handyman.findByIdAndUpdate(handymanProfile._id, {
      $set: { rating: 5.0, monthlyCancellationCount: 2 },
    });
    const order = await makeOrder(customer._id, handyman._id, 'arrived');

    await request(server)
      .patch(`/api/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${handymanToken}`)
      .send({ status: 'cancelled' });

    const updatedHandyman = await Handyman.findById(handymanProfile._id);
    expect(updatedHandyman.rating).toBe(4.5);
    expect(updatedHandyman.monthlyCancellationCount).toBe(3);
    expect(updatedHandyman.penaltyAmount).toBe(50); // 3rd → financial penalty
  });

  test('32. 4th cancellation → rating -0.5 + 50 EGP', async () => {
    const { user: customer } = await makeCustomer('32');
    const { user: handyman, token: handymanToken, handyman: handymanProfile } = await makeHandyman('32');
    await Handyman.findByIdAndUpdate(handymanProfile._id, {
      $set: { rating: 5.0, monthlyCancellationCount: 3, penaltyAmount: 50 },
    });
    const order = await makeOrder(customer._id, handyman._id, 'price_confirmed');

    await request(server)
      .patch(`/api/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${handymanToken}`)
      .send({ status: 'cancelled' });

    const updatedHandyman = await Handyman.findById(handymanProfile._id);
    expect(updatedHandyman.rating).toBe(4.5);
    expect(updatedHandyman.monthlyCancellationCount).toBe(4);
    expect(updatedHandyman.penaltyAmount).toBe(100); // 50 + 50
  });

  test('33. New month resets monthly cancellation counter', async () => {
    const { user: customer } = await makeCustomer('33');
    const { user: handyman, token: handymanToken, handyman: handymanProfile } = await makeHandyman('33');
    const now = new Date();
    const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    // Simulate previous month's data
    await Handyman.findByIdAndUpdate(handymanProfile._id, {
      $set: {
        rating: 5.0,
        monthlyCancellationCount: 4,
        monthlyCancellationMonth: prevMonth,
        monthlyCancellationYear: prevYear,
        penaltyAmount: 100,
      },
    });

    const order = await makeOrder(customer._id, handyman._id, 'price_confirmed');

    await request(server)
      .patch(`/api/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${handymanToken}`)
      .send({ status: 'cancelled' });

    const updatedHandyman = await Handyman.findById(handymanProfile._id);
    // Counter should reset to 1 (first cancellation in new month)
    expect(updatedHandyman.monthlyCancellationCount).toBe(1);
    expect(updatedHandyman.monthlyCancellationMonth).toBe(now.getMonth());
    expect(updatedHandyman.monthlyCancellationYear).toBe(now.getFullYear());
    // Rating still deducted
    expect(updatedHandyman.rating).toBe(4.5);
    // No financial penalty (1st in new month, count was reset to 0 then incremented to 1)
    expect(updatedHandyman.penaltyAmount).toBe(100); // Unchanged from previous
  });
});
