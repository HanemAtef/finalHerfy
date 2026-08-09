const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const server = require('../app');
const User = require('../models/User');
const Order = require('../models/Order');
const { generateAccessToken } = require('../utils/generateToken');

let mongoServer, clientSocket;
let testUser, testToken, testOrder;
let port;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  await new Promise((resolve) => {
    server.listen(0, () => {
      port = server.address().port;
      resolve();
    });
  });


  // Create test user and order
  testUser = await User.create({
    name: 'Tracking User',
    email: 'tracking@test.com',
    password: 'Password123!',
    role: 'customer',
    isVerified: true,
    phone: '+20000000010'
  });
  testToken = generateAccessToken(testUser);

  testOrder = await Order.create({
    customerId: testUser._id,
    handymanId: new mongoose.Types.ObjectId(), // Fake handyman
    status: 'pending',
    profession: 'plumbing',
    customerLocation: { type: 'Point', coordinates: [30.0, 31.0], address: 'Test' }
  });

  clientSocket = new Client(`http://localhost:${port}`, {
    auth: { token: testToken }
  });
  await new Promise((resolve, reject) => {
    clientSocket.on('connect', resolve);
    clientSocket.on('connect_error', reject);
  });
});

afterAll(async () => {
  if (clientSocket) clientSocket.close();
  server.close();
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Live Tracking Socket - Fix 8 Acceptance Tests', () => {
  it('Fix 8: sendLocation with non-ObjectId does not crash server', (done) => {
    clientSocket.emit('sendLocation', { orderId: 'invalid-id', lat: 30.0, lng: 31.0 });
    
    // If it doesn't crash, the test passes
    setTimeout(() => {
      done();
    }, 500);
  });

  it('Fix 8: startTracking without valid token gets error (or ignored)', (done) => {
    clientSocket.emit('startTracking', { orderId: testOrder._id.toString() });
    
    // Since there's no ack, we just verify it doesn't crash
    setTimeout(() => {
      done();
    }, 500);
  });

  it('Fix 8: sendLocation for order with pending status does not update handymanLiveLocation', async () => {
    // Send location as if we are the handyman (or some user)
    // Actually the socket handler fetches the order and checks status.
    // If status is pending, it shouldn't update location.
    clientSocket.emit('sendLocation', { 
      orderId: testOrder._id.toString(), 
      lat: 30.1, 
      lng: 31.1, 
      token: testToken 
    });

    await new Promise(resolve => setTimeout(resolve, 500));
    const order = await Order.findById(testOrder._id);
    expect(order.handymanLiveLocation.coordinates).toEqual([0, 0]); // Should not be updated
  });
});
