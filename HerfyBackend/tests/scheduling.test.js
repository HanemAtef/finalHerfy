const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Handyman = require('../models/Handyman');
const Order = require('../models/Order');

// Mock Stripe, TomTom, Email
jest.mock('../config/stripe', () => ({
  paymentIntents: { retrieve: jest.fn(), create: jest.fn() },
  webhooks: { constructEvent: jest.fn() },
}));
jest.mock('../utils/tomtom', () => ({
  calculateRoute: jest.fn().mockImplementation((origin, destination) => {
    return Promise.resolve({
      distance: 5000,
      eta: 10,
      trafficDelay: 0,
      arrivalTime: new Date().toISOString(),
      geometry: null,
      isFallback: false,
    });
  }),
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

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, name: user.name, isAdmin: user.isAdmin || false },
    process.env.JWT_SECRET || 'test_secret_key_12345'
  );
};

const createCustomer = async (suffix = '1', coords = [31.2357, 30.0444]) => {
  return await User.create({
    name: `Customer ${suffix}`,
    email: `customer${suffix}@test.com`,
    password: 'password123',
    role: 'customer',
    isVerified: true,
    status: 'approved',
    location: {
      type: 'Point',
      coordinates: coords,
    },
  });
};

const createHandyman = async (suffix = '1', coords = [31.2357, 30.0444]) => {
  const user = await User.create({
    name: `Handyman ${suffix}`,
    email: `handyman${suffix}@test.com`,
    password: 'password123',
    role: 'handyman',
    isVerified: true,
    status: 'approved',
    location: {
      type: 'Point',
      coordinates: coords,
    },
  });
  const profile = await Handyman.create({
    userId: user._id,
    profession: 'سباك',
    price: 150,
    isAvailable: true,
    registrationStatus: 'approved',
    verified: false,
    rating: 0,
    completedOrders: 0,
    totalOffers: 0,
    acceptedOffers: 0,
    location: {
      type: 'Point',
      coordinates: coords,
    },
  });
  return { user, profile };
};

describe('1. Orders Scheduling, Same-Day Validation, Duration, and Travel Rules', () => {
  test('Creating order in the past MUST be rejected', async () => {
    const customer = await createCustomer('past1');
    const { user: handymanUser } = await createHandyman('past1');
    const customerToken = generateToken(customer);

    const pastDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

    const res = await request(server)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        handymanId: handymanUser._id.toString(),
        profession: 'سباك',
        scheduledDate: pastDate.toISOString(),
        customerLocation: { coordinates: [31.2357, 30.0444] },
      });

    expect(res.status).toBe(400);
    expect(res.body.msg).toMatch(/وقت سابق/);
  });

  test('Creating order on a future date (e.g. tomorrow or next week) MUST be allowed', async () => {
    const customer = await createCustomer('futureDay1');
    const { user: handymanUser } = await createHandyman('futureDay1');
    const customerToken = generateToken(customer);

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const res = await request(server)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        handymanId: handymanUser._id.toString(),
        profession: 'سباك',
        scheduledDate: tomorrow.toISOString(),
        customerLocation: { coordinates: [31.2357, 30.0444] },
      });

    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('pending');
    expect(new Date(res.body.order.scheduledDate).getTime()).toBe(tomorrow.getTime());
  });

  test('Creating order with insufficient travel time for distance MUST be rejected', async () => {
    // Handyman in Cairo center [31.2357, 30.0444]
    // Customer far away in 6th of October [30.9833, 29.9667] (~40 km away)
    const customer = await createCustomer('farCustomer', [30.9833, 29.9667]);
    const { user: handymanUser } = await createHandyman('cairoHandyman', [31.2357, 30.0444]);
    const customerToken = generateToken(customer);

    // Mock TomTom to return 90 minutes travel time for this route
    const { calculateRoute } = require('../utils/tomtom');
    calculateRoute.mockResolvedValueOnce({
      distance: 40000,
      eta: 90,
      trafficDelay: 10,
      arrivalTime: new Date().toISOString(),
      geometry: null,
      isFallback: false,
    });

    // Customer attempts to book in 15 minutes from now today
    const tooSoon = new Date(Date.now() + 15 * 60 * 1000);

    const res = await request(server)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        handymanId: handymanUser._id.toString(),
        profession: 'سباك',
        scheduledDate: tooSoon.toISOString(),
        customerLocation: { coordinates: [30.9833, 29.9667] },
      });

    expect(res.status).toBe(400);
    expect(res.body.msg).toMatch(/غير كافٍ لوصول الحرفي/);
    expect(res.body).toHaveProperty('minAllowedTime');
  });

  test('Customer creates same-day future order without default duration (expectedDuration is null until handyman accepts)', async () => {
    const customer = await createCustomer('1');
    const { user: handymanUser } = await createHandyman('1');
    const customerToken = generateToken(customer);

    const todayFuture = new Date(Date.now() + 45 * 60 * 1000);

    // Create Order A
    const resA = await request(server)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        handymanId: handymanUser._id.toString(),
        profession: 'سباك',
        description: 'تصليح ماسورة المطبخ',
        scheduledDate: todayFuture.toISOString(),
        customerLocation: { coordinates: [31.2357, 30.0444] },
      });

    expect(resA.status).toBe(201);
    expect(resA.body.order.status).toBe('pending');
    expect(resA.body.order.expectedDuration).toBeNull();
  });

  test('Handyman accepts order and specifies EXACT custom duration (e.g. 3.5 hours) which is saved correctly', async () => {
    const customer = await createCustomer('2');
    const { user: handymanUser } = await createHandyman('2');
    const customerToken = generateToken(customer);
    const handymanToken = generateToken(handymanUser);

    const futureDate = new Date(Date.now() + 45 * 60 * 1000);

    // Create Order
    const resA = await request(server)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        handymanId: handymanUser._id.toString(),
        profession: 'سباك',
        scheduledDate: futureDate.toISOString(),
        customerLocation: { coordinates: [31.2357, 30.0444] },
      });
    const orderId = resA.body.order._id;

    // Handyman accepts with price 250 and expectedDuration 3.5
    const acceptRes = await request(server)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${handymanToken}`)
      .send({ status: 'accepted', price: 250, expectedDuration: 3.5 });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.order.price).toBe(250);
    expect(acceptRes.body.order.expectedDuration).toBe(3.5);

    const orderInDb = await Order.findById(orderId);
    expect(orderInDb.expectedDuration).toBe(3.5);
  });

  test('Handyman can start tracking BEFORE appointment time (early travel allowed)', async () => {
    const customer = await createCustomer('trackingEarly');
    const { user: handymanUser } = await createHandyman('trackingEarly');
    const customerToken = generateToken(customer);
    const handymanToken = generateToken(handymanUser);

    const futureTime = new Date(Date.now() + 50 * 60 * 1000); // 50 min in future today

    const res = await request(server)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        handymanId: handymanUser._id.toString(),
        profession: 'سباك',
        scheduledDate: futureTime.toISOString(),
        customerLocation: { coordinates: [31.2357, 30.0444] },
      });
    const orderId = res.body.order._id;

    // Handyman accepts
    await request(server)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${handymanToken}`)
      .send({ status: 'accepted', price: 150, expectedDuration: 1 });

    // Customer confirms price
    await request(server)
      .patch(`/api/orders/${orderId}/confirm-price`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ confirmed: true });

    // Mark on the way before appointment time arrives -> MUST SUCCEED
    const onTheWayRes = await request(server)
      .patch(`/api/orders/${orderId}/on-the-way`)
      .set('Authorization', `Bearer ${handymanToken}`);

    expect(onTheWayRes.status).toBe(200);
    expect(onTheWayRes.body.order.isHandymanOnTheWay).toBe(true);
    expect(onTheWayRes.body.order.trackingStatus).toBe('active');
    expect(onTheWayRes.body.order.arrivalTime).toBeTruthy();
  });

  test('Cancellation reason is saved and returned when customer or handyman cancels', async () => {
    const customer = await createCustomer('cancelReason1');
    const { user: handymanUser } = await createHandyman('cancelReason1');
    const customerToken = generateToken(customer);

    const futureTime = new Date(Date.now() + 40 * 60 * 1000);

    const res = await request(server)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        handymanId: handymanUser._id.toString(),
        profession: 'سباك',
        scheduledDate: futureTime.toISOString(),
        customerLocation: { coordinates: [31.2357, 30.0444] },
      });
    const orderId = res.body.order._id;

    const cancelRes = await request(server)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'cancelled', cancellationReason: 'تم حل المشكلة ذاتياً' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.order.cancellationReason).toBe('تم حل المشكلة ذاتياً');
    expect(cancelRes.body.order.cancelledBy).toBe('customer');

    const fetchedOrder = await Order.findById(orderId);
    expect(fetchedOrder.cancellationReason).toBe('تم حل المشكلة ذاتياً');
  });

  test('Cancellation without a reason preserves null/empty instead of defaulting to a fake string', async () => {
    const customer = await createCustomer('cancelNoReason');
    const { user: handymanUser } = await createHandyman('cancelNoReason');
    const customerToken = generateToken(customer);

    const futureTime = new Date(Date.now() + 40 * 60 * 1000);

    const res = await request(server)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        handymanId: handymanUser._id.toString(),
        profession: 'سباك',
        scheduledDate: futureTime.toISOString(),
        customerLocation: { coordinates: [31.2357, 30.0444] },
      });
    const orderId = res.body.order._id;

    const cancelRes = await request(server)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'cancelled' }); // No cancellationReason sent

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.order.cancellationReason).toBeNull();

    const fetchedOrder = await Order.findById(orderId);
    expect(fetchedOrder.cancellationReason).toBeNull();
  });

  test('Customer orders endpoint returns all bookings and accurate total count across statuses', async () => {
    const customer = await createCustomer('countAudit');
    const { user: handymanUser } = await createHandyman('countAudit');
    const customerToken = generateToken(customer);

    // Create 12 orders with various statuses
    for (let i = 0; i < 12; i++) {
      const order = await Order.create({
        customerId: customer._id,
        handymanId: handymanUser._id,
        profession: 'سباك',
        description: `Order ${i}`,
        scheduledDate: new Date(Date.now() + (i + 1) * 3600 * 1000),
        status: i % 2 === 0 ? 'completed' : 'pending',
        customerLocation: { type: 'Point', coordinates: [31.2357, 30.0444] },
      });
    }

    const res = await request(server)
      .get(`/api/orders/customer/${customer._id}`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(12);
    expect(res.body.data.length).toBe(12);
  });

  test('Handyman with 5 cancellations correctly has 3 penalties and 150 EGP penalty amount reflected in analytics', async () => {
    const customer = await createCustomer('penaltyAudit');
    const { user: handymanUser, profile } = await createHandyman('penaltyAudit');
    const handymanToken = generateToken(handymanUser);

    // Create 5 cancelled orders where handyman cancelled
    for (let i = 0; i < 5; i++) {
      await Order.create({
        customerId: customer._id,
        handymanId: handymanUser._id,
        profession: 'سباك',
        description: `Cancelled Order ${i}`,
        scheduledDate: new Date(Date.now() + (i + 1) * 3600 * 1000),
        status: 'cancelled',
        cancelledBy: 'handyman',
        customerLocation: { type: 'Point', coordinates: [31.2357, 30.0444] },
      });
    }

    profile.monthlyCancellationCount = 5;
    profile.penaltyCount = 3;
    profile.penaltyAmount = 150;
    await profile.save();

    const res = await request(server)
      .get(`/api/handyman/${handymanUser._id}/analytics`)
      .set('Authorization', `Bearer ${handymanToken}`);

    expect(res.status).toBe(200);
    expect(res.body.cancelledOrders).toBe(5);
    expect(res.body.monthlyCancellationCount).toBe(5);
    expect(res.body.penaltyCount).toBe(3);
    expect(res.body.penaltyAmount).toBe(150);
  });

  test('After completing 10 orders with >= 4.5 rating, Handyman becomes verified', async () => {
    const customer = await createCustomer('verify1');
    const { user: handymanUser, profile } = await createHandyman('verify1');
    const customerToken = generateToken(customer);
    const handymanToken = generateToken(handymanUser);

    expect(profile.verified).toBe(false);

    profile.completedOrders = 9;
    profile.rating = 4.8;
    await profile.save();

    const futureTime = new Date(Date.now() + 40 * 60 * 1000);

    // Create 10th order
    const res = await request(server)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        handymanId: handymanUser._id.toString(),
        profession: 'سباك',
        scheduledDate: futureTime.toISOString(),
        customerLocation: { coordinates: [31.2357, 30.0444] },
      });
    const orderId = res.body.order._id;

    // Accept -> in-progress -> complete
    await request(server)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${handymanToken}`)
      .send({ status: 'accepted', price: 100, expectedDuration: 2 });

    await request(server)
      .patch(`/api/orders/${orderId}/confirm-price`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ confirmed: true });

    await request(server)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${handymanToken}`)
      .send({ status: 'in-progress' });

    const completeRes = await request(server)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${handymanToken}`)
      .send({ status: 'completed', completionImage: 'https://example.com/proof.jpg' });

    expect(completeRes.status).toBe(200);

    const updatedProfile = await Handyman.findOne({ userId: handymanUser._id });
    expect(updatedProfile.completedOrders).toBe(10);
    expect(updatedProfile.verified).toBe(true);
  });

  test('Handyman with unpaid penalty cannot accept new orders until penalty is settled', async () => {
    const customer = await createCustomer('penAcceptTest');
    const { user: handymanUser, profile: handymanProfile } = await createHandyman('penAcceptTest');
    const customerToken = generateToken(customer);
    const handymanToken = generateToken(handymanUser);

    // Set penalty on handyman profile
    handymanProfile.penaltyAmount = 100;
    handymanProfile.penaltyCount = 2;
    await handymanProfile.save();

    const futureTime = new Date(Date.now() + 40 * 60 * 1000);

    const orderRes = await request(server)
      .post('/api/orders/create')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        handymanId: handymanUser._id.toString(),
        profession: 'سباك',
        scheduledDate: futureTime.toISOString(),
        customerLocation: { coordinates: [31.2357, 30.0444] },
      });
    const orderId = orderRes.body.order._id;

    // Handyman tries to accept -> should be blocked with 403
    const acceptBlocked = await request(server)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${handymanToken}`)
      .send({ status: 'accepted', price: 200, expectedDuration: 1.5 });

    expect(acceptBlocked.status).toBe(403);
    expect(acceptBlocked.body.msg).toContain('غرامة مستحقة');
    expect(acceptBlocked.body.penaltyAmount).toBe(100);

    // Settle penalty via cash / admin
    await Handyman.findByIdAndUpdate(handymanProfile._id, { $set: { penaltyAmount: 0 } });
    await User.findByIdAndUpdate(handymanUser._id, { $set: { penaltyAmount: 0 } });

    // Handyman tries to accept again -> succeeds!
    const acceptSuccess = await request(server)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${handymanToken}`)
      .send({ status: 'accepted', price: 200, expectedDuration: 1.5 });

    expect(acceptSuccess.status).toBe(200);
    expect(acceptSuccess.body.order.status).toBe('accepted');
    expect(acceptSuccess.body.order.expectedDuration).toBe(1.5);
  });
});
