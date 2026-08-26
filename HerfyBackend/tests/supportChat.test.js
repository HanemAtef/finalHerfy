const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SupportConversation = require('../models/SupportConversation');
const SupportMessage = require('../models/SupportMessage');

// Mock stripe SDK
jest.mock('../config/stripe', () => ({
  paymentIntents: { retrieve: jest.fn(), create: jest.fn() },
  webhooks: { constructEvent: jest.fn() },
}));

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

describe('6 & 7. Contact Admin & Support Chat System', () => {
  test('Customer opens conversation and sends message to Admin', async () => {
    const customer = await User.create({
      name: 'Ahmed Customer',
      email: 'ahmed@test.com',
      password: 'password123',
      role: 'customer',
      phone: '01012345678',
      isVerified: true,
    });
    const customerToken = generateToken(customer);

    // 1. Get or create conversation
    const getRes = await request(server)
      .get('/api/support/my-conversation')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);
    expect(getRes.body.conversation.userRole).toBe('customer');
    expect(getRes.body.conversation.userName).toBe('Ahmed Customer');
    expect(getRes.body.messages).toEqual([]);

    // 2. Customer sends message
    const sendRes = await request(server)
      .post('/api/support/my-conversation/messages')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ text: 'مرحباً، لدي استفسار عن طريقة الدفع', type: 'text' });

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.message.text).toBe('مرحباً، لدي استفسار عن طريقة الدفع');
    expect(sendRes.body.conversation.unreadAdminCount).toBe(1);
    expect(sendRes.body.conversation.lastMessage).toContain('مرحباً');
  });

  test('Craftsman opens conversation and sends message to Admin', async () => {
    const handyman = await User.create({
      name: 'Mahmoud Handyman',
      email: 'mahmoud@test.com',
      password: 'password123',
      role: 'handyman',
      phone: '01198765432',
      isVerified: true,
    });
    const handymanToken = generateToken(handyman);

    // 1. Handyman sends message
    const sendRes = await request(server)
      .post('/api/support/my-conversation/messages')
      .set('Authorization', `Bearer ${handymanToken}`)
      .send({ text: 'أريد تحديث بيانات الحساب البنكي', type: 'text' });

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.conversation.userRole).toBe('handyman');
    expect(sendRes.body.message.senderRole).toBe('handyman');
    expect(sendRes.body.conversation.unreadAdminCount).toBe(1);
  });

  test('Admin views conversations, filters by role, reads messages, and replies', async () => {
    const admin = await User.create({
      name: 'Super Admin',
      email: 'admin@herfy.com',
      password: 'password123',
      isAdmin: true,
      role: 'customer',
      isVerified: true,
    });
    const adminToken = generateToken(admin);

    const customer = await User.create({
      name: 'Sara Customer',
      email: 'sara@test.com',
      password: 'password123',
      role: 'customer',
      isVerified: true,
    });
    const customerToken = generateToken(customer);

    const handyman = await User.create({
      name: 'Hassan Craftsman',
      email: 'hassan@test.com',
      password: 'password123',
      role: 'handyman',
      isVerified: true,
    });
    const handymanToken = generateToken(handyman);

    // Customer and Handyman both send messages
    await request(server)
      .post('/api/support/my-conversation/messages')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ text: 'رسالة من سارة' });

    await request(server)
      .post('/api/support/my-conversation/messages')
      .set('Authorization', `Bearer ${handymanToken}`)
      .send({ text: 'رسالة من حسن الحرفي' });

    // Admin views all conversations
    const listRes = await request(server)
      .get('/api/support/admin/conversations')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.count).toBe(2);
    expect(listRes.body.totalUnread).toBe(2);

    // Admin filters by role 'handyman'
    const filterRes = await request(server)
      .get('/api/support/admin/conversations?role=handyman')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(filterRes.status).toBe(200);
    expect(filterRes.body.count).toBe(1);
    expect(filterRes.body.data[0].userName).toBe('Hassan Craftsman');

    const conversationId = filterRes.body.data[0]._id;

    // Admin reads messages in handyman's conversation
    const messagesRes = await request(server)
      .get(`/api/support/admin/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(messagesRes.status).toBe(200);
    expect(messagesRes.body.messages.length).toBe(1);
    expect(messagesRes.body.messages[0].seen).toBe(true);
    expect(messagesRes.body.conversation.unreadAdminCount).toBe(0);

    // Admin sends reply to handyman
    const replyRes = await request(server)
      .post(`/api/support/admin/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ text: 'أهلاً بك يا حسن، تم استلام طلبك وجاري المتابعة معك.' });

    expect(replyRes.status).toBe(201);
    expect(replyRes.body.message.senderRole).toBe('admin');
    expect(replyRes.body.conversation.unreadUserCount).toBe(1);

    // Handyman checks their conversation -> admin message is there and marked seen
    const handymanCheck = await request(server)
      .get('/api/support/my-conversation')
      .set('Authorization', `Bearer ${handymanToken}`);

    expect(handymanCheck.status).toBe(200);
    expect(handymanCheck.body.messages.length).toBe(2);
    expect(handymanCheck.body.messages[1].text).toContain('أهلاً بك يا حسن');
    expect(handymanCheck.body.conversation.unreadUserCount).toBe(0);
  });

  test('Security: Non-admin users cannot access admin support endpoints', async () => {
    const customer = await User.create({
      name: 'Regular Customer',
      email: 'reg@test.com',
      password: 'password123',
      role: 'customer',
      isVerified: true,
    });
    const customerToken = generateToken(customer);

    const adminConvRes = await request(server)
      .get('/api/support/admin/conversations')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(adminConvRes.status).toBe(403);
  });
});
