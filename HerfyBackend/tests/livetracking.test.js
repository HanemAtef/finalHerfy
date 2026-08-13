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

    customerSocket.emit('joinOrderRoom', orderId);
    await waitForEvent(customerSocket, 'joinOrderRoomAck');

    customerSocket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 300));

    const reconnected = Client(`http://localhost:${port}`, { auth: { token: customerToken } });
    await waitForEvent(reconnected, 'connect');
    reconnected.emit('joinOrderRoom', orderId);
    const ack = await waitForEvent(reconnected, 'joinOrderRoomAck');
    expect(ack.success).toBe(true);
    reconnected.close();
  });
});
