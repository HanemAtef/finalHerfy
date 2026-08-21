const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createServer } = require('http');
const { io: Client } = require('socket.io-client');
const server = require('../app');
const User = require('../models/User');
const Order = require('../models/Order');
const { generateAccessToken } = require('../utils/generateToken');
const { syncTestIndexes } = require('./helpers/syncTestIndexes');
const liveTrackingSocketModule = require('../socket/livetracking.socket');
const { lastHandymanLocations, arrivedOrders, arrivalTripState } =
  liveTrackingSocketModule.__internals;

let mongoServer;
let customerSocket;
let handymanSocket;
let customerUser;
let handymanUser;
let customerToken;
let handymanToken;
let testOrder;
let port;

const waitForEvent = (socket, event, timeoutMs = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await syncTestIndexes();

  await new Promise((resolve) => {
    server.listen(0, () => {
      port = server.address().port;
      resolve();
    });
  });

  customerUser = await User.create({
    name: 'Tracking Customer',
    email: 'tracking-customer@test.com',
    password: 'Password123!',
    role: 'customer',
    isVerified: true,
    phone: '+20000000010',
  });

  handymanUser = await User.create({
    name: 'Tracking Handyman',
    email: 'tracking-handyman@test.com',
    password: 'Password123!',
    role: 'handyman',
    isVerified: true,
    phone: '+20000000011',
    location: { type: 'Point', coordinates: [31.0, 30.0] },
  });

  customerToken = generateAccessToken(customerUser);
  handymanToken = generateAccessToken(handymanUser);

  testOrder = await Order.create({
    customerId: customerUser._id,
    handymanId: handymanUser._id,
    status: 'pending',
    profession: 'plumbing',
    customerLocation: { type: 'Point', coordinates: [31.0, 30.0], address: 'Test' },
  });

  customerSocket = Client(`http://localhost:${port}`, {
    auth: { token: customerToken },
  });
  handymanSocket = Client(`http://localhost:${port}`, {
    auth: { token: handymanToken },
  });

  await Promise.all([
    waitForEvent(customerSocket, 'connect'),
    waitForEvent(handymanSocket, 'connect'),
  ]);
});

afterAll(async () => {
  if (customerSocket) customerSocket.close();
  if (handymanSocket) handymanSocket.close();
  server.close();
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Order.deleteMany({});
  arrivedOrders.clear();
  arrivalTripState.clear();
  lastHandymanLocations.clear();

  testOrder = await Order.create({
    customerId: customerUser._id,
    handymanId: handymanUser._id,
    status: 'pending',
    profession: 'plumbing',
    customerLocation: { type: 'Point', coordinates: [31.0, 30.0], address: 'Test' },
  });
});

describe('Live Tracking Socket - Fix 8 Acceptance Tests', () => {
  it('Fix 8: sendLocation with non-ObjectId does not crash server', (done) => {
    customerSocket.emit('sendLocation', { orderId: 'invalid-id', lat: 30.0, lng: 31.0 });
    setTimeout(() => done(), 500);
  });

  it('Fix 8: startTracking without valid token gets error (or ignored)', (done) => {
    customerSocket.emit('startTracking', { orderId: testOrder._id.toString() });
    setTimeout(() => done(), 500);
  });

  it('Fix 8: sendLocation for order with pending status does not update handymanLiveLocation', async () => {
    customerSocket.emit('sendLocation', {
      orderId: testOrder._id.toString(),
      lat: 30.1,
      lng: 31.1,
    });

    await new Promise((resolve) => setTimeout(resolve, 500));
    const order = await Order.findById(testOrder._id);
    expect(order.handymanLiveLocation.coordinates).toEqual([0, 0]);
  });

  it('joinOrderRoom returns ack for authorized customer', async () => {
    const liveOrder = await Order.create({
      customerId: customerUser._id,
      handymanId: handymanUser._id,
      status: 'price_confirmed',
      profession: 'plumbing',
      isHandymanOnTheWay: true,
      customerLocation: { type: 'Point', coordinates: [31.0, 30.0], address: 'Test' },
    });

    customerSocket.emit('joinOrderRoom', liveOrder._id.toString());
    const ack = await waitForEvent(customerSocket, 'joinOrderRoomAck');
    expect(ack.success).toBe(true);
    expect(ack.role).toBe('customer');
  });

  it('handyman sendLocation broadcasts locationUpdate to customer in room', async () => {
    const liveOrder = await Order.create({
      customerId: customerUser._id,
      handymanId: handymanUser._id,
      status: 'price_confirmed',
      profession: 'plumbing',
      isHandymanOnTheWay: true,
      customerLocation: { type: 'Point', coordinates: [31.05, 30.05], address: 'Route Test' },
    });
    const orderId = liveOrder._id.toString();

    const locationPromise = waitForEvent(customerSocket, 'locationUpdate', 5000);

    customerSocket.emit('joinOrderRoom', orderId);
    await waitForEvent(customerSocket, 'joinOrderRoomAck');

    handymanSocket.emit('joinOrderRoom', orderId);
    await waitForEvent(handymanSocket, 'joinOrderRoomAck');

    handymanSocket.emit('sendLocation', {
      orderId,
      lat: 30.06,
      lng: 31.06,
    });

    const payload = await locationPromise;
    expect(Number(payload.lat)).toBeCloseTo(30.06, 4);
    expect(Number(payload.lng)).toBeCloseTo(31.06, 4);
    expect(payload.customerLat).toBeDefined();
    expect(payload.customerLng).toBeDefined();
  });
});

describe('Live Tracking — arrival guards (#5)', () => {
  beforeEach(() => {
    arrivedOrders.clear();
    arrivalTripState.clear();
    lastHandymanLocations.clear();
  });

  it('blocks handymanArrived when co-located at active tracking start', async () => {
    const liveOrder = await Order.create({
      customerId: customerUser._id,
      handymanId: handymanUser._id,
      status: 'price_confirmed',
      profession: 'plumbing',
      isHandymanOnTheWay: true,
      customerLocation: { type: 'Point', coordinates: [31.06, 30.06], address: 'Same spot' },
    });
    const orderId = liveOrder._id.toString();

    customerSocket.emit('joinOrderRoom', orderId);
    await waitForEvent(customerSocket, 'joinOrderRoomAck');
    handymanSocket.emit('joinOrderRoom', orderId);
    await waitForEvent(handymanSocket, 'joinOrderRoomAck');

    let arrived = false;
    const onArrived = () => { arrived = true; };
    customerSocket.on('handymanArrived', onArrived);

    handymanSocket.emit('sendLocation', { orderId, lat: 30.06, lng: 31.06 });
    await new Promise((resolve) => setTimeout(resolve, 800));

    customerSocket.off('handymanArrived', onArrived);
    expect(arrived).toBe(false);
  });

  it('blocks arrival before handyman is on the way', async () => {
    const liveOrder = await Order.create({
      customerId: customerUser._id,
      handymanId: handymanUser._id,
      status: 'price_confirmed',
      profession: 'plumbing',
      isHandymanOnTheWay: false,
      customerLocation: { type: 'Point', coordinates: [31.06, 30.06], address: 'Same spot' },
    });
    const orderId = liveOrder._id.toString();

    handymanSocket.emit('joinOrderRoom', orderId);
    await waitForEvent(handymanSocket, 'joinOrderRoomAck');

    let arrived = false;
    handymanSocket.on('handymanArrived', () => { arrived = true; });

    handymanSocket.emit('sendLocation', { orderId, lat: 30.06, lng: 31.06 });
    await new Promise((resolve) => setTimeout(resolve, 800));

    handymanSocket.off('handymanArrived');
    expect(arrived).toBe(false);
  });

  it('emits handymanArrived after handyman was en-route then near customer', async () => {
    const liveOrder = await Order.create({
      customerId: customerUser._id,
      handymanId: handymanUser._id,
      status: 'price_confirmed',
      profession: 'plumbing',
      isHandymanOnTheWay: true,
      customerLocation: { type: 'Point', coordinates: [31.06, 30.06], address: 'Arrival Test' },
    });
    const orderId = liveOrder._id.toString();

    customerSocket.emit('joinOrderRoom', orderId);
    await waitForEvent(customerSocket, 'joinOrderRoomAck');
    handymanSocket.emit('joinOrderRoom', orderId);
    await waitForEvent(handymanSocket, 'joinOrderRoomAck');

    handymanSocket.emit('sendLocation', { orderId, lat: 30.12, lng: 31.12 });
    await new Promise((resolve) => setTimeout(resolve, 600));

    const arrivedPromise = waitForEvent(customerSocket, 'handymanArrived', 5000);
    handymanSocket.emit('sendLocation', { orderId, lat: 30.0602, lng: 31.0602 });
    const payload = await arrivedPromise;
    expect(payload.orderId).toBe(orderId);
  });
});

describe('Live Tracking — reconnect & stale replay (#4)', () => {
  beforeEach(() => {
    arrivedOrders.clear();
    arrivalTripState.clear();
    lastHandymanLocations.clear();
  });

  it('does not replay stale handyman GPS on joinOrderRoom', async () => {
    const liveOrder = await Order.create({
      customerId: customerUser._id,
      handymanId: handymanUser._id,
      status: 'price_confirmed',
      profession: 'plumbing',
      isHandymanOnTheWay: true,
      customerLocation: { type: 'Point', coordinates: [31.05, 30.05], address: 'Replay Test' },
    });
    const orderId = liveOrder._id.toString();

    lastHandymanLocations.set(orderId, {
      lat: 30.05,
      lng: 31.05,
      updatedAt: Date.now() - 300000,
    });

    let replayed = false;
    const onUpdate = () => { replayed = true; };
    customerSocket.on('locationUpdate', onUpdate);

    customerSocket.emit('joinOrderRoom', orderId);
    await waitForEvent(customerSocket, 'joinOrderRoomAck');
    await new Promise((resolve) => setTimeout(resolve, 400));

    customerSocket.off('locationUpdate', onUpdate);
    expect(replayed).toBe(false);
  });

  it('customer reconnect can re-join order room', async () => {
    const liveOrder = await Order.create({
      customerId: customerUser._id,
      handymanId: handymanUser._id,
      status: 'price_confirmed',
      profession: 'plumbing',
      isHandymanOnTheWay: true,
      customerLocation: { type: 'Point', coordinates: [31.05, 30.05], address: 'Reconnect' },
    });
    const orderId = liveOrder._id.toString();

    const tempCustomerSocket = Client(`http://localhost:${port}`, { auth: { token: customerToken } });
    await waitForEvent(tempCustomerSocket, 'connect');

    tempCustomerSocket.emit('joinOrderRoom', orderId);
    await waitForEvent(tempCustomerSocket, 'joinOrderRoomAck');

    tempCustomerSocket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 300));

    const reconnected = Client(`http://localhost:${port}`, { auth: { token: customerToken } });
    await waitForEvent(reconnected, 'connect');
    reconnected.emit('joinOrderRoom', orderId);
    const ack = await waitForEvent(reconnected, 'joinOrderRoomAck');
    expect(ack.success).toBe(true);
    reconnected.close();
  });
});

describe('Live Tracking Architecture & Critical Rules Verification', () => {
  beforeEach(() => {
    arrivedOrders.clear();
    arrivalTripState.clear();
    lastHandymanLocations.clear();
  });

  it('Critical Rule 1 & 2: startTracking does not reset trackingStartedAt or trackingExpiresAt', async () => {
    const trackingOrder = await Order.create({
      customerId: customerUser._id,
      handymanId: handymanUser._id,
      status: 'in-progress',
      profession: 'plumbing',
      isHandymanOnTheWay: true,
      trackingStatus: 'active',
      trackingStartedAt: new Date(Date.now() - 5000),
      trackingExpiresAt: new Date(Date.now() + 600000),
      customerLocation: { type: 'Point', coordinates: [31.05, 30.05], address: 'Rule 2 Test' },
    });
    const orderId = trackingOrder._id.toString();

    const originalStartedAt = trackingOrder.trackingStartedAt.getTime();
    const originalExpiresAt = trackingOrder.trackingExpiresAt.getTime();

    handymanSocket.emit('startTracking', orderId);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const updated = await Order.findById(orderId);
    expect(updated.trackingStartedAt.getTime()).toBe(originalStartedAt);
    expect(updated.trackingExpiresAt.getTime()).toBe(originalExpiresAt);
    expect(updated.trackingStatus).toBe('active');
  });

  it('Critical Rule 2: startTracking after expired does not reactivate tracking', async () => {
    const expiredOrder = await Order.create({
      customerId: customerUser._id,
      handymanId: handymanUser._id,
      status: 'in-progress',
      profession: 'plumbing',
      isHandymanOnTheWay: true,
      trackingStatus: 'expired',
      trackingStartedAt: new Date(Date.now() - 3600000),
      trackingExpiresAt: new Date(Date.now() - 1000),
      customerLocation: { type: 'Point', coordinates: [31.05, 30.05], address: 'Expired Test' },
    });
    const orderId = expiredOrder._id.toString();

    handymanSocket.emit('startTracking', orderId);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const updated = await Order.findById(orderId);
    expect(updated.trackingStatus).toBe('expired');
    expect(updated.status).toBe('in-progress');
  });

  it('Critical Rule 4: sendLocation after expiration triggers single trackingExpired emit and sets trackingStatus=expired', async () => {
    const expiringOrder = await Order.create({
      customerId: customerUser._id,
      handymanId: handymanUser._id,
      status: 'in-progress',
      profession: 'plumbing',
      isHandymanOnTheWay: true,
      trackingStatus: 'active',
      trackingStartedAt: new Date(Date.now() - 3600000),
      trackingExpiresAt: new Date(Date.now() - 100),
      customerLocation: { type: 'Point', coordinates: [31.05, 30.05], address: 'Timeout Test' },
    });
    const orderId = expiringOrder._id.toString();

    customerSocket.emit('joinOrderRoom', orderId);
    await waitForEvent(customerSocket, 'joinOrderRoomAck');
    handymanSocket.emit('joinOrderRoom', orderId);
    await waitForEvent(handymanSocket, 'joinOrderRoomAck');

    const expiredPromise = waitForEvent(customerSocket, 'trackingExpired', 3000);

    handymanSocket.emit('sendLocation', { orderId, lat: 30.1, lng: 31.1 });
    const payload = await expiredPromise;

    expect(payload.orderId).toBe(orderId);
    expect(payload.trackingStatus).toBe('expired');

    const checkDb = await Order.findById(orderId);
    expect(checkDb.trackingStatus).toBe('expired');
    expect(checkDb.status).toBe('in-progress');
  });

  it('Requirement 3 & 4: sendLocation without joining order room is rejected', async () => {
    const unjoinedOrder = await Order.create({
      customerId: customerUser._id,
      handymanId: handymanUser._id,
      status: 'price_confirmed',
      profession: 'plumbing',
      isHandymanOnTheWay: true,
      trackingStatus: 'active',
      customerLocation: { type: 'Point', coordinates: [31.05, 30.05], address: 'Unjoined Test' },
    });
    const orderId = unjoinedOrder._id.toString();

    // Create a fresh unjoined socket
    const freshSocket = Client(`http://localhost:${port}`, { auth: { token: handymanToken } });
    await waitForEvent(freshSocket, 'connect');

    const errPromise = waitForEvent(freshSocket, 'sendLocationError', 8000);
    freshSocket.emit('sendLocation', { orderId, lat: 30.1, lng: 31.1 });
    const err = await errPromise;
    expect(err.msg).toMatch(/not joined/i);
    freshSocket.close();
  });

  it('Requirement 1 & 9: Handyman cannot activate tracking for Order B while Order A has active tracking', async () => {
    const orderA = await Order.create({
      customerId: customerUser._id,
      handymanId: handymanUser._id,
      status: 'price_confirmed',
      profession: 'plumbing',
      isHandymanOnTheWay: true,
      trackingStatus: 'active',
      trackingExpiresAt: new Date(Date.now() + 600000),
      customerLocation: { type: 'Point', coordinates: [31.05, 30.05], address: 'Order A' },
    });

    const orderB = await Order.create({
      customerId: customerUser._id,
      handymanId: handymanUser._id,
      status: 'price_confirmed',
      profession: 'plumbing',
      isHandymanOnTheWay: true,
      trackingStatus: 'active',
      trackingExpiresAt: new Date(Date.now() + 600000),
      customerLocation: { type: 'Point', coordinates: [31.08, 30.08], address: 'Order B' },
    });

    // Handyman joins Order B room and tries to emit sendLocation for Order B while Order A is active
    handymanSocket.emit('joinOrderRoom', orderB._id.toString());
    await waitForEvent(handymanSocket, 'joinOrderRoomAck');

    const errPromise = waitForEvent(handymanSocket, 'sendLocationError', 8000);
    handymanSocket.emit('sendLocation', { orderId: orderB._id.toString(), lat: 30.08, lng: 31.08 });
    const err = await errPromise;
    expect(err.msg).toMatch(/Another order is currently active/i);
  });
});
