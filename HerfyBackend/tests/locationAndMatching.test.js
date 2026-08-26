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

const createCustomer = async (suffix = '1', coords = [31.2357, 30.0444], address = 'Tahrir Square, Cairo') => {
  return await User.create({
    name: `Customer ${suffix}`,
    email: `customer${suffix}@test.com`,
    password: 'password123',
    role: 'customer',
    isVerified: true,
    status: 'approved',
    address,
    location: {
      type: 'Point',
      coordinates: coords,
    },
  });
};

const createHandyman = async (
  suffix = '1',
  coords = [31.2357, 30.0444],
  address = 'Dokki, Giza',
  profession = 'سباك',
  price = 150
) => {
  const user = await User.create({
    name: `Handyman ${suffix}`,
    email: `handyman${suffix}@test.com`,
    password: 'password123',
    role: 'handyman',
    isVerified: true,
    status: 'approved',
    address,
    location: {
      type: 'Point',
      coordinates: coords,
    },
  });
  const profile = await Handyman.create({
    userId: user._id,
    profession,
    price,
    address,
    isAvailable: true,
    registrationStatus: 'approved',
    verified: true,
    rating: 4.8,
    completedOrders: 12,
    totalOffers: 10,
    acceptedOffers: 10,
    location: {
      type: 'Point',
      coordinates: coords,
    },
  });
  return { user, profile };
};

describe('2. Dynamic Location, Distance Sorting, Availability & Security Tests', () => {
  // ==========================================
  // SECTION A: Handyman Base Location Tests
  // ==========================================
  describe('A. Handyman Base Location', () => {
    test('Handyman can save and update Base Location (latitude, longitude, address)', async () => {
      const { user: handymanUser } = await createHandyman('loc1', [31.2001, 30.0101], 'Old Address');
      const token = generateToken(handymanUser);

      const updateRes = await request(server)
        .put(`/api/handyman/${handymanUser._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          address: 'New Street 15, Nasr City',
          location: {
            type: 'Point',
            coordinates: [31.3300, 30.0600],
          },
          price: 200,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.handyman.address).toBe('New Street 15, Nasr City');
      expect(updateRes.body.handyman.location.coordinates).toEqual([31.3300, 30.0600]);

      // Check DB synchronization in both Handyman and User models
      const updatedHandyman = await Handyman.findOne({ userId: handymanUser._id });
      const updatedUser = await User.findById(handymanUser._id);
      expect(updatedHandyman.address).toBe('New Street 15, Nasr City');
      expect(updatedHandyman.location.coordinates).toEqual([31.3300, 30.0600]);
      expect(updatedUser.address).toBe('New Street 15, Nasr City');
      expect(updatedUser.location.coordinates).toEqual([31.3300, 30.0600]);
    });

    test('Invalid coordinates during registration or update MUST be rejected or sanitized', async () => {
      const { user: handymanUser } = await createHandyman('invalid1', [31.2, 30.0]);
      const token = generateToken(handymanUser);

      // Lat > 90 is invalid
      const res = await request(server)
        .put(`/api/handyman/${handymanUser._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          location: {
            type: 'Point',
            coordinates: [31.2, 195.0], // invalid latitude 195
          },
        });

      expect(res.status).toBe(400);
    });

    test('Security: Handyman cannot update another handyman location', async () => {
      const { user: handyman1 } = await createHandyman('h1');
      const { user: handyman2 } = await createHandyman('h2');
      const token1 = generateToken(handyman1);

      // Handyman 1 tries to update Handyman 2's location
      const res = await request(server)
        .put(`/api/handyman/${handyman2._id}`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          address: 'Hacked Address',
          location: { coordinates: [30.0, 31.0] },
        });

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // SECTION B: Order Service Location Tests
  // ==========================================
  describe('B. Order Service Location', () => {
    test('Customer can specify unique Service Location per order (lat, lng, address)', async () => {
      const customer = await createCustomer('serviceLocCust', [31.2000, 30.0000], 'Home Address');
      const { user: handymanUser } = await createHandyman('serviceLocHandy', [31.2100, 30.0100]);
      const customerToken = generateToken(customer);

      const futureDate = new Date(Date.now() + 2 * 3600 * 1000);

      const res = await request(server)
        .post('/api/orders/create')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          handymanId: handymanUser._id.toString(),
          profession: 'سباك',
          description: 'صيانة بموقع العمل بالمعادي',
          scheduledDate: futureDate.toISOString(),
          customerLocation: {
            type: 'Point',
            coordinates: [31.2600, 29.9600], // Service location in Maadi
            address: 'شارع 9، المعادي، القاهرة',
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.order.customerLocation.coordinates).toEqual([31.2600, 29.9600]);
      expect(res.body.order.customerLocation.address).toBe('شارع 9، المعادي، القاهرة');
    });

    test('Order with invalid or missing coordinates is rejected by backend validation', async () => {
      const customer = await createCustomer('invalidOrderCust');
      const { user: handymanUser } = await createHandyman('invalidOrderHandy');
      const customerToken = generateToken(customer);

      const res = await request(server)
        .post('/api/orders/create')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          handymanId: handymanUser._id.toString(),
          profession: 'سباك',
          customerLocation: {
            coordinates: [500, -200], // Invalid coordinates
          },
        });

      expect(res.status).toBe(400);
    });

    test('Security: Customer cannot access details/location of orders belonging to others', async () => {
      const customer1 = await createCustomer('c1');
      const customer2 = await createCustomer('c2');
      const { user: handymanUser } = await createHandyman('hOrder');
      const token1 = generateToken(customer1);
      const token2 = generateToken(customer2);

      const orderRes = await request(server)
        .post('/api/orders/create')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          handymanId: handymanUser._id.toString(),
          profession: 'سباك',
          scheduledDate: new Date(Date.now() + 3600 * 1000).toISOString(),
          customerLocation: {
            coordinates: [31.2357, 30.0444],
            address: 'Secret Address 1',
          },
        });

      const orderId = orderRes.body.order._id;

      // Customer 2 tries to fetch Customer 1's order details
      const getRes = await request(server)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${token2}`);

      expect(getRes.status).toBe(403);
    });
  });

  // ==========================================
  // SECTION C: Distance Calculation & Nearest-First Sorting Tests
  // ==========================================
  describe('C. Haversine Distance & Nearest-First Sorting', () => {
    test('Handymen are returned sorted from nearest to farthest from service location', async () => {
      // Order service location: Tahrir Cairo [31.2357, 30.0444]
      // Handyman A: Dokki (~2 km) [31.2150, 30.0380]
      // Handyman B: Heliopolis (~12 km) [31.3300, 30.0900]
      // Handyman C: 6th of October (~32 km) [30.9300, 29.9700]
      const { user: hB } = await createHandyman('B_Heliopolis', [31.3300, 30.0900], 'Heliopolis', 'كهربائي');
      const { user: hA } = await createHandyman('A_Dokki', [31.2150, 30.0380], 'Dokki', 'كهربائي');
      const { user: hC } = await createHandyman('C_October', [30.9300, 29.9700], 'October', 'كهربائي');

      const res = await request(server)
        .get('/api/handyman/nearby')
        .query({
          lat: 30.0444,
          lng: 31.2357,
          profession: 'كهربائي',
          sort: 'distance',
        });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(3);

      const returned = res.body.handymen;
      expect(returned[0].id.toString()).toBe(hA._id.toString());
      expect(returned[1].id.toString()).toBe(hB._id.toString());
      expect(returned[2].id.toString()).toBe(hC._id.toString());

      // Distances are in ascending order
      expect(returned[0].distance).toBeLessThan(returned[1].distance);
      expect(returned[1].distance).toBeLessThan(returned[2].distance);
      expect(returned[0]).toHaveProperty('distanceKm');
      expect(returned[0]).toHaveProperty('distanceText');
      expect(returned[0]).toHaveProperty('address');
    });

    test('Searching with non-matching profession returns only craftsmen of the requested profession', async () => {
      await createHandyman('Plumber1', [31.23, 30.04], 'Addr1', 'سباك');
      await createHandyman('Electrician1', [31.23, 30.04], 'Addr2', 'كهربائي');
      await createHandyman('Carpenter1', [31.23, 30.04], 'Addr3', 'نجار');

      const res = await request(server)
        .get('/api/handyman/nearby')
        .query({
          lat: 30.0444,
          lng: 31.2357,
          profession: 'سباك',
        });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.handymen[0].profession).toBe('سباك');
    });
  });

  // ==========================================
  // SECTION D: Availability & Schedule Conflict Tests
  // ==========================================
  describe('D. Schedule Conflict & Availability during Discovery & Booking', () => {
    test('Handyman with conflicting overlapping order is excluded when searching with scheduledDate', async () => {
      const { user: busyHandyman } = await createHandyman('busyH', [31.22, 30.04], 'Addr', 'سباك');
      const { user: freeHandyman } = await createHandyman('freeH', [31.24, 30.04], 'Addr', 'سباك');
      const customer = await createCustomer('custSchedule');

      const baseTime = new Date(Date.now() + 5 * 3600 * 1000); // 5 hours in future

      // Busy handyman has an accepted order from 5h to 7h (2 hours duration)
      await Order.create({
        customerId: customer._id,
        handymanId: busyHandyman._id,
        profession: 'سباك',
        scheduledDate: baseTime,
        expectedDuration: 2,
        expectedEndTime: new Date(baseTime.getTime() + 2 * 3600 * 1000),
        status: 'accepted',
        customerLocation: { type: 'Point', coordinates: [31.22, 30.04] },
      });

      // Customer searches for a plumber at baseTime + 1 hour (overlaps with 5h - 7h window)
      const requestedTime = new Date(baseTime.getTime() + 1 * 3600 * 1000);

      const res = await request(server)
        .get('/api/handyman/nearby')
        .query({
          lat: 30.04,
          lng: 31.23,
          profession: 'سباك',
          scheduledDate: requestedTime.toISOString(),
          expectedDuration: 1,
        });

      expect(res.status).toBe(200);
      // Busy handyman must be excluded because of schedule conflict
      const ids = res.body.handymen.map((h) => h.id.toString());
      expect(ids).not.toContain(busyHandyman._id.toString());
      expect(ids).toContain(freeHandyman._id.toString());
    });

    test('Creating order directly on a handyman who has schedule conflict is rejected with 400', async () => {
      const { user: handymanUser } = await createHandyman('busyDirect', [31.22, 30.04]);
      const customer1 = await createCustomer('c1Direct');
      const customer2 = await createCustomer('c2Direct');
      const token2 = generateToken(customer2);

      const targetTime = new Date(Date.now() + 6 * 3600 * 1000);

      // Existing active order
      await Order.create({
        customerId: customer1._id,
        handymanId: handymanUser._id,
        profession: 'سباك',
        scheduledDate: targetTime,
        expectedDuration: 2,
        status: 'accepted',
        customerLocation: { type: 'Point', coordinates: [31.22, 30.04] },
      });

      // Customer 2 attempts to book the same time
      const res = await request(server)
        .post('/api/orders/create')
        .set('Authorization', `Bearer ${token2}`)
        .send({
          handymanId: handymanUser._id.toString(),
          profession: 'سباك',
          scheduledDate: targetTime.toISOString(),
          expectedDuration: 1,
          customerLocation: { coordinates: [31.22, 30.04] },
        });

      expect(res.status).toBe(400);
      expect(res.body.msg).toMatch(/تعارض/);
    });

    test('Cancelled or completed orders do NOT block craftsman from receiving new orders at that time', async () => {
      const { user: handymanUser } = await createHandyman('freeAfterCancel', [31.22, 30.04]);
      const customer = await createCustomer('custAfterCancel');
      const customerToken = generateToken(customer);

      const targetTime = new Date(Date.now() + 8 * 3600 * 1000);

      // Order was cancelled
      await Order.create({
        customerId: customer._id,
        handymanId: handymanUser._id,
        profession: 'سباك',
        scheduledDate: targetTime,
        expectedDuration: 2,
        status: 'cancelled',
        customerLocation: { type: 'Point', coordinates: [31.22, 30.04] },
      });

      // Customer books at targetTime -> MUST SUCCEED
      const res = await request(server)
        .post('/api/orders/create')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          handymanId: handymanUser._id.toString(),
          profession: 'سباك',
          scheduledDate: targetTime.toISOString(),
          expectedDuration: 1,
          customerLocation: { coordinates: [31.22, 30.04] },
        });

      expect(res.status).toBe(201);
      expect(res.body.order.status).toBe('pending');
    });

    test('Non-overlapping order (e.g. order ends before new order starts) allows craftsman to appear and accept', async () => {
      const { user: handymanUser } = await createHandyman('nonOverlapHandy', [31.22, 30.04]);
      const customer = await createCustomer('nonOverlapCust');
      const customerToken = generateToken(customer);

      const morningTime = new Date(Date.now() + 4 * 3600 * 1000); // 10:00 (ends at 12:00)
      const afternoonTime = new Date(Date.now() + 8 * 3600 * 1000); // 14:00 (non-overlapping)

      // Existing order 10:00 - 12:00
      await Order.create({
        customerId: customer._id,
        handymanId: handymanUser._id,
        profession: 'سباك',
        scheduledDate: morningTime,
        expectedDuration: 2,
        status: 'accepted',
        customerLocation: { type: 'Point', coordinates: [31.22, 30.04] },
      });

      // New order at 14:00 -> MUST SUCCEED
      const res = await request(server)
        .post('/api/orders/create')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          handymanId: handymanUser._id.toString(),
          profession: 'سباك',
          scheduledDate: afternoonTime.toISOString(),
          expectedDuration: 1.5,
          customerLocation: { coordinates: [31.22, 30.04] },
        });

      expect(res.status).toBe(201);
      expect(res.body.order.status).toBe('pending');
    });
  });
});
