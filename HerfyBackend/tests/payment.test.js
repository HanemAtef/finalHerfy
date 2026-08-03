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
function seq() { return ++_seq; }

async function makeCustomer() {
  const n = seq();
  const user = await User.create({
    name: 'Customer',
    email: `customer${n}@pay.test`,
    password: 'Password123!',
    role: 'customer',
    isVerified: true,
    phone: `+4000000${String(n).padStart(4,'0')}`,
  });
  return { user, token: generateAccessToken(user) };
}

async function makeHandyman() {
  const n = seq();
  const user = await User.create({
    name: 'Handyman',
    email: `handyman${n}@pay.test`,
    password: 'Password123!',
    role: 'handyman',
    isVerified: true,
    phone: `+5000000${String(n).padStart(4,'0')}`,
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

describe('Payment — commission calculation', () => {
  it('applies 10% commission for standard order', async () => {
    const { user: cUser } = await makeCustomer();
    const { user: hUser, token: hToken } = await makeHandyman();

    const order = await Order.create({
      customerId: cUser._id,
      handymanId: hUser._id,
      profession: 'Plumbing',
      description: 'Fix pipe',
      requestType: 'instant',
      estimatedPrice: 200,
      customerLocation: { type: 'Point', coordinates: [31.2, 30.1] },
      status: 'in-progress',
      price: 200,
      commissionRate: 10,
      isEmergency: false,
    });

    const res = await request(app)
      .patch(`/api/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${hToken}`)
      .send({ status: 'completed', completionImage: 'https://example.com/proof.jpg' });

    expect(res.statusCode).toBe(200);
    expect(res.body.order.commissionAmount).toBe(20);
    expect(res.body.order.netAmount).toBe(180);
  });

  it('applies 15% commission for emergency order', async () => {
    const { user: cUser } = await makeCustomer();
    const { user: hUser, token: hToken } = await makeHandyman();

    const order = await Order.create({
      customerId: cUser._id,
      handymanId: hUser._id,
      profession: 'Plumbing',
      description: 'Emergency fix',
      requestType: 'instant',
      estimatedPrice: 200,
      customerLocation: { type: 'Point', coordinates: [31.2, 30.1] },
      status: 'in-progress',
      price: 200,
      commissionRate: 15,
      isEmergency: true,
    });

    const res = await request(app)
      .patch(`/api/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${hToken}`)
      .send({ status: 'completed', completionImage: 'https://example.com/proof.jpg' });

    expect(res.statusCode).toBe(200);
    expect(res.body.order.commissionAmount).toBe(30);
    expect(res.body.order.netAmount).toBe(170);
  });
});

describe('Payment — wallet balance on cash confirmation', () => {
  it('adds commission to handyman wallet on cash payment confirmation', async () => {
    const { user: cUser } = await makeCustomer();
    const { user: hUser, token: hToken } = await makeHandyman();

    const order = await Order.create({
      customerId: cUser._id,
      handymanId: hUser._id,
      profession: 'Plumbing',
      description: 'Fix pipe',
      requestType: 'instant',
      estimatedPrice: 100,
      customerLocation: { type: 'Point', coordinates: [31.2, 30.1] },
      status: 'completed',
      price: 100,
      commissionRate: 10,
      commissionAmount: 10,
      netAmount: 90,
      paymentStatus: 'unpaid',
    });

    const res = await request(app)
      .patch(`/api/orders/${order._id}/confirm-payment`)
      .set('Authorization', `Bearer ${hToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.walletBalance).toBe(10);
  });

  it('rejects payment confirmation on non-completed order', async () => {
    const { user: cUser } = await makeCustomer();
    const { user: hUser, token: hToken } = await makeHandyman();

    const order = await Order.create({
      customerId: cUser._id,
      handymanId: hUser._id,
      profession: 'Plumbing',
      description: 'Fix pipe',
      requestType: 'instant',
      estimatedPrice: 100,
      customerLocation: { type: 'Point', coordinates: [31.2, 30.1] },
      status: 'in-progress',
      price: 100,
      commissionRate: 10,
    });

    const res = await request(app)
      .patch(`/api/orders/${order._id}/confirm-payment`)
      .set('Authorization', `Bearer ${hToken}`);

    expect(res.statusCode).toBe(400);
  });
});
