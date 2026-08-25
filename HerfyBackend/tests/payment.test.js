// tests/payment.test.js
// Comprehensive tests for the post-completion payment flow (card + cash).

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Handyman = require('../models/Handyman');
const Order = require('../models/Order');

// The stripe config module throws if STRIPE_SECRET_KEY is missing,
// but setup.js sets a dummy value. We mock the stripe SDK so no real
// API calls are made.
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

// Import the server after mocks are set up
const server = require('../app');
const stripeMock = require('../config/stripe');

// ---------------------------------------------------------------------------
// MongoDB Memory Server Setup (runs within the test framework so beforeAll is available)
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
  // Clear mock call history between tests
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
    location: {
      type: 'Point',
      coordinates: [31.236, 30.044],
    },
  });
  const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, {
    expiresIn: '1h',
    issuer: 'my-app',
    audience: 'my-users',
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
  });
  const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, {
    expiresIn: '1h',
    issuer: 'my-app',
    audience: 'my-users',
  });
  return { user, handyman, token };
}

async function makeOrder(customerId, handymanId, status = 'completed') {
  const order = await Order.create({
    customerId,
    handymanId,
    profession: 'plumber',
    description: 'Fix sink',
    estimatedPrice: 150,
    totalPrice: 200,
    price: 200,
    status,
    customerLocation: {
      type: 'Point',
      coordinates: [31.236, 30.044],
    },
    commissionRate: 10,
    commissionAmount: 20,
    netAmount: 180,
    completionImage: 'https://example.com/proof.jpg',
  });
  return order;
}

function advanceOrderToCompleted(order, handymanId, handymanToken) {
  // Helper: transition an order from any status to completed via API
  // (for integration tests that test the full lifecycle)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Payment Flow — Post-Completion Only', () => {
  describe('CARD PAYMENT', () => {
    test('1. PaymentIntent rejected before completed', async () => {
      const { user: customer, token: customerToken } = await makeCustomer('01');
      const { user: handyman } = await makeHandyman('01');

      const order = await makeOrder(customer._id, handyman._id, 'price_confirmed');

      const res = await request(server)
        .post(`/api/orders/${order._id}/create-payment-intent`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.msg).toMatch(/completed/i);
    });

    test('2. PaymentIntent allowed after completed', async () => {
      const { user: customer, token: customerToken } = await makeCustomer('02');
      const { user: handyman } = await makeHandyman('02');

      const order = await makeOrder(customer._id, handyman._id, 'completed');

      stripeMock.__mockCreate.mockResolvedValue({
        id: 'pi_test_123',
        client_secret: 'pi_test_123_secret',
      });

      const res = await request(server)
        .post(`/api/orders/${order._id}/create-payment-intent`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.clientSecret).toBe('pi_test_123_secret');

      // Verify order was updated
      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.stripePaymentIntentId).toBe('pi_test_123');
      expect(updatedOrder.paymentMethod).toBe('card');
      expect(updatedOrder.paymentStatus).toBe('pending');
    });

    test('3. Unauthorized customer cannot pay another customer\'s order', async () => {
      const { user: customer1, token: customer1Token } = await makeCustomer('03');
      const { user: customer2 } = await makeCustomer('03b');
      const { user: handyman } = await makeHandyman('03');

      const order = await makeOrder(customer1._id, handyman._id, 'completed');

      // customer2 tries to pay for customer1's order
      const res = await request(server)
        .post(`/api/orders/${order._id}/create-payment-intent`)
        .set('Authorization', `Bearer ${jwt.sign({ id: customer2._id, role: 'customer' }, JWT_SECRET, { expiresIn: '1h', issuer: 'my-app', audience: 'my-users' })}`);

      expect(res.status).toBe(403);
    });

    test('4. Already-paid order cannot create another payment', async () => {
      const { user: customer, token: customerToken } = await makeCustomer('04');
      const { user: handyman } = await makeHandyman('04');

      const order = await makeOrder(customer._id, handyman._id, 'completed');
      order.paymentStatus = 'paid';
      order.paidAt = new Date();
      await order.save();

      const res = await request(server)
        .post(`/api/orders/${order._id}/create-payment-intent`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.msg).toMatch(/already been paid/i);
    });

    test('5. PaymentIntent contains correct order metadata', async () => {
      const { user: customer, token: customerToken } = await makeCustomer('05');
      const { user: handyman } = await makeHandyman('05');

      const order = await makeOrder(customer._id, handyman._id, 'completed');

      stripeMock.__mockCreate.mockResolvedValue({
        id: 'pi_test_meta',
        client_secret: 'pi_test_meta_secret',
      });

      await request(server)
        .post(`/api/orders/${order._id}/create-payment-intent`)
        .set('Authorization', `Bearer ${customerToken}`);

      // Verify stripe.paymentIntents.create was called with correct metadata
      expect(stripeMock.__mockCreate).toHaveBeenCalled();
      const createCall = stripeMock.__mockCreate.mock.calls[stripeMock.__mockCreate.mock.calls.length - 1];
      const createArgs = createCall[0];
      expect(createArgs.metadata).toBeDefined();
      expect(createArgs.metadata.orderId).toBe(order._id.toString());
      expect(createArgs.metadata.customerId).toBe(customer._id.toString());
      expect(createArgs.metadata.handymanId).toBe(handyman._id.toString());
      // Amount should be based on order price
      expect(createArgs.amount).toBe(20000); // 200 EGP * 100
      expect(createArgs.currency).toBe('egp');
    });

    test('6. Stripe success webhook marks order paid', async () => {
      const { user: customer } = await makeCustomer('06');
      const { user: handyman } = await makeHandyman('06');

      const order = await makeOrder(customer._id, handyman._id, 'completed');
      order.stripePaymentIntentId = 'pi_webhook_test';
      order.paymentMethod = 'card';
      order.paymentStatus = 'pending';
      await order.save();

      // Mock webhook event
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_webhook_test' } },
      });

      const res = await request(server)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'test_sig')
        .send({ id: 'pi_webhook_test' });

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);

      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.paymentStatus).toBe('paid');
      expect(updatedOrder.paidAt).toBeTruthy();
    });

    test('7. Duplicate Stripe webhook does NOT credit handyman twice', async () => {
      const { user: customer } = await makeCustomer('07');
      const { user: handyman } = await makeHandyman('07');

      const order = await makeOrder(customer._id, handyman._id, 'completed');
      order.stripePaymentIntentId = 'pi_dup_test';
      order.paymentMethod = 'card';
      order.paymentStatus = 'pending';
      await order.save();

      // First webhook
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_dup_test' } },
      });

      await request(server)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'test_sig')
        .send({ id: 'pi_dup_test' });

      const handymanAfter1 = await Handyman.findOne({ userId: handyman._id });
      const earningsAfter1 = handymanAfter1.pendingEarnings;

      // Second webhook (duplicate)
      await request(server)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'test_sig')
        .send({ id: 'pi_dup_test' });

      const handymanAfter2 = await Handyman.findOne({ userId: handyman._id });
      const earningsAfter2 = handymanAfter2.pendingEarnings;

      expect(earningsAfter2).toBe(earningsAfter1); // No double credit
      expect(earningsAfter1).toBe(180); // net = 200 - 20 commission
    });
  });

  describe('CASH PAYMENT', () => {
    test('8. Customer can select cash after completed', async () => {
      const { user: customer, token: customerToken } = await makeCustomer('08');
      const { user: handyman } = await makeHandyman('08');

      const order = await makeOrder(customer._id, handyman._id, 'completed');

      const res = await request(server)
        .patch(`/api/orders/${order._id}/select-payment-method`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ paymentMethod: 'cash' });

      expect(res.status).toBe(200);
      expect(res.body.order.paymentMethod).toBe('cash');
      expect(res.body.order.paymentStatus).toBe('pending');
    });

    test('9. Customer cannot select cash before completed', async () => {
      const { user: customer, token: customerToken } = await makeCustomer('09');
      const { user: handyman } = await makeHandyman('09');

      const order = await makeOrder(customer._id, handyman._id, 'price_confirmed');

      const res = await request(server)
        .patch(`/api/orders/${order._id}/select-payment-method`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ paymentMethod: 'cash' });

      expect(res.status).toBe(400);
      expect(res.body.msg).toMatch(/completed/i);
    });

    test('10. Customer cannot select payment method for another customer\'s order', async () => {
      const { user: customer1 } = await makeCustomer('10');
      const { user: customer2 } = await makeCustomer('10b');
      const { user: handyman } = await makeHandyman('10');

      const order = await makeOrder(customer1._id, handyman._id, 'completed');

      const customer2Token = jwt.sign(
        { id: customer2._id, role: 'customer' },
        JWT_SECRET,
        { expiresIn: '1h', issuer: 'my-app', audience: 'my-users' }
      );

      const res = await request(server)
        .patch(`/api/orders/${order._id}/select-payment-method`)
        .set('Authorization', `Bearer ${customer2Token}`)
        .send({ paymentMethod: 'cash' });

      expect(res.status).toBe(403);
    });

    test('11. Handyman can confirm cash for assigned completed order', async () => {
      const { user: customer } = await makeCustomer('11');
      const { user: handyman, token: handymanToken } = await makeHandyman('11');

      const order = await makeOrder(customer._id, handyman._id, 'completed');
      order.paymentMethod = 'cash';
      order.paymentStatus = 'pending';
      await order.save();

      const res = await request(server)
        .patch(`/api/orders/${order._id}/confirm-payment`)
        .set('Authorization', `Bearer ${handymanToken}`);

      expect(res.status).toBe(200);
      expect(res.body.order.paymentStatus).toBe('paid');
    });

    test('12. Wrong handyman cannot confirm cash', async () => {
      const { user: customer } = await makeCustomer('12');
      const { user: handyman1 } = await makeHandyman('12');
      const { user: handyman2, token: handyman2Token } = await makeHandyman('12b');

      const order = await makeOrder(customer._id, handyman1._id, 'completed');
      order.paymentMethod = 'cash';
      order.paymentStatus = 'pending';
      await order.save();

      const res = await request(server)
        .patch(`/api/orders/${order._id}/confirm-payment`)
        .set('Authorization', `Bearer ${handyman2Token}`);

      expect(res.status).toBe(403);
    });

    test('13. Card payment cannot be confirmed through cash endpoint', async () => {
      const { user: customer } = await makeCustomer('13');
      const { user: handyman, token: handymanToken } = await makeHandyman('13');

      const order = await makeOrder(customer._id, handyman._id, 'completed');
      order.paymentMethod = 'card';
      order.paymentStatus = 'pending';
      await order.save();

      const res = await request(server)
        .patch(`/api/orders/${order._id}/confirm-payment`)
        .set('Authorization', `Bearer ${handymanToken}`);

      expect(res.status).toBe(400);
      expect(res.body.msg).toMatch(/cash/i);
    });

    test('14. Cash confirmation changes paymentStatus to paid', async () => {
      const { user: customer } = await makeCustomer('14');
      const { user: handyman, token: handymanToken } = await makeHandyman('14');

      const order = await makeOrder(customer._id, handyman._id, 'completed');
      order.paymentMethod = 'cash';
      order.paymentStatus = 'pending';
      await order.save();

      await request(server)
        .patch(`/api/orders/${order._id}/confirm-payment`)
        .set('Authorization', `Bearer ${handymanToken}`);

      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.paymentStatus).toBe('paid');
    });

    test('15. paidAt is populated after cash confirmation', async () => {
      const { user: customer } = await makeCustomer('15');
      const { user: handyman, token: handymanToken } = await makeHandyman('15');

      const order = await makeOrder(customer._id, handyman._id, 'completed');
      order.paymentMethod = 'cash';
      order.paymentStatus = 'pending';
      await order.save();

      await request(server)
        .patch(`/api/orders/${order._id}/confirm-payment`)
        .set('Authorization', `Bearer ${handymanToken}`);

      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.paidAt).toBeTruthy();
      expect(updatedOrder.paidAt).toBeInstanceOf(Date);
    });

    test('16. Duplicate cash confirmation cannot credit earnings twice', async () => {
      const { user: customer } = await makeCustomer('16');
      const { user: handyman, token: handymanToken } = await makeHandyman('16');

      const order = await makeOrder(customer._id, handyman._id, 'completed');
      order.paymentMethod = 'cash';
      order.paymentStatus = 'pending';
      await order.save();

      // First confirmation
      await request(server)
        .patch(`/api/orders/${order._id}/confirm-payment`)
        .set('Authorization', `Bearer ${handymanToken}`);

      const handymanAfter1 = await Handyman.findOne({ userId: handyman._id });
      const walletAfter1 = handymanAfter1.walletBalance;

      // Second confirmation attempt
      const res2 = await request(server)
        .patch(`/api/orders/${order._id}/confirm-payment`)
        .set('Authorization', `Bearer ${handymanToken}`);

      expect(res2.status).toBe(400);
      expect(res2.body.msg).toMatch(/already confirmed/i);

      const handymanAfter2 = await Handyman.findOne({ userId: handyman._id });
      expect(handymanAfter2.walletBalance).toBe(walletAfter1); // No double credit
    });

    test('17. Paid order cannot be paid again (selectPaymentMethod)', async () => {
      const { user: customer, token: customerToken } = await makeCustomer('17');
      const { user: handyman } = await makeHandyman('17');

      const order = await makeOrder(customer._id, handyman._id, 'completed');
      order.paymentStatus = 'paid';
      order.paidAt = new Date();
      await order.save();

      const res = await request(server)
        .patch(`/api/orders/${order._id}/select-payment-method`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ paymentMethod: 'cash' });

      expect(res.status).toBe(400);
      expect(res.body.msg).toMatch(/already been paid/i);
    });
  });

  describe('REGRESSION', () => {
    test('18. Existing order lifecycle still works (pending → completed)', async () => {
      const { user: customer, token: customerToken } = await makeCustomer('18');
      const { user: handyman, token: handymanToken } = await makeHandyman('18');

      // Create order
      const createRes = await request(server)
        .post('/api/orders/create')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          handymanId: handyman._id,
          profession: 'plumber',
          description: 'Fix sink',
          estimatedPrice: 150,
          customerLocation: {
            type: 'Point',
            coordinates: [31.236, 30.044],
          },
        });

      expect(createRes.status).toBe(201);
      const orderId = createRes.body.order._id || createRes.body.order._id;

      // Accept
      const acceptRes = await request(server)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${handymanToken}`)
        .send({ status: 'accepted', price: 200 });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.order.status).toBe('accepted');

      // Confirm price
      const confirmRes = await request(server)
        .patch(`/api/orders/${orderId}/confirm-price`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ confirmed: true });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.order.status).toBe('price_confirmed');

      // In progress
      const progressRes = await request(server)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${handymanToken}`)
        .send({ status: 'in-progress' });

      expect(progressRes.status).toBe(200);
      expect(progressRes.body.order.status).toBe('in-progress');

      // Arrived
      const arrivedRes = await request(server)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${handymanToken}`)
        .send({ status: 'arrived' });

      expect(arrivedRes.status).toBe(200);
      expect(arrivedRes.body.order.status).toBe('arrived');

      // Completed
      const completeRes = await request(server)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${handymanToken}`)
        .send({ status: 'completed', completionImage: 'https://example.com/proof.jpg' });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.order.status).toBe('completed');
    });

    test('19. No PaymentIntent can be created at price_confirmed', async () => {
      const { user: customer, token: customerToken } = await makeCustomer('19');
      const { user: handyman } = await makeHandyman('19');

      const order = await makeOrder(customer._id, handyman._id, 'price_confirmed');

      const res = await request(server)
        .post(`/api/orders/${order._id}/create-payment-intent`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(400);
    });

    test('20. selectPaymentMethod rejects invalid payment method', async () => {
      const { user: customer, token: customerToken } = await makeCustomer('20');
      const { user: handyman } = await makeHandyman('20');

      const order = await makeOrder(customer._id, handyman._id, 'completed');

      const res = await request(server)
        .patch(`/api/orders/${order._id}/select-payment-method`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ paymentMethod: 'crypto' });

      expect(res.status).toBe(400);
      expect(res.body.msg).toMatch(/cash.*card|paymentMethod/i);
    });
  });
});
