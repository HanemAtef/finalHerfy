require('dotenv').config();
const mongoose = require('mongoose');
const JWT = require('jsonwebtoken');
const axios = require('axios');
const User = require('./models/User');
const Handyman = require('./models/Handyman');
const Order = require('./models/Order');

async function testCompleteFlow() {
  await mongoose.connect(process.env.MONGO_URI);
  let cust = await User.findOne({ email: 'workflow_customer@herfy.com' });
  if (!cust) cust = await User.create({ name: 'c', email: 'workflow_customer@herfy.com', phone: '01011111111', password: '1', role: 'customer', isVerified: true });
  else { cust.isVerified = true; await cust.save(); }

  let hm = await User.findOne({ email: 'workflow_handyman@herfy.com' });
  if (!hm) hm = await User.create({ name: 'h', email: 'workflow_handyman@herfy.com', phone: '01022222222', password: '1', role: 'handyman', isVerified: true });
  else { hm.isVerified = true; await hm.save(); }
  
  const custToken = JWT.sign({ id: cust._id, role: 'customer' }, process.env.JWT_SECRET);
  const hmToken = JWT.sign({ id: hm._id, role: 'handyman' }, process.env.JWT_SECRET);

  const order = await Order.create({
    customerId: cust._id,
    handymanId: hm._id,
    profession: 'كهربائي',
    status: 'in-progress',
    scheduledDate: new Date(),
    orderLocation: { type: 'Point', coordinates: [31.309, 30.0876] }
  });

  console.log('Initial Order Status in DB:', (await Order.findById(order._id)).status);

  const res = await axios.patch(`http://localhost:8000/api/orders/${order._id}/status`, {
    status: 'completed',
    completionImage: 'https://example.com/photo.jpg'
  }, { headers: { Authorization: `Bearer ${hmToken}` } });

  console.log('Response from PATCH:', res.data.order.status);

  const getRes = await axios.get(`http://localhost:8000/api/orders/${order._id}`, {
    headers: { Authorization: `Bearer ${custToken}` }
  });
  console.log('Response from GET after PATCH:', getRes.data.status);
  console.log('Direct DB fetch after PATCH:', (await Order.findById(order._id)).status);
  console.log('completedAt in DB:', (await Order.findById(order._id)).completedAt);
  console.log('completionImage in DB:', (await Order.findById(order._id)).completionImage);

  await Order.deleteMany({ _id: order._id });
  process.exit(0);
}
testCompleteFlow().catch(e => console.error(e.response?.data || e.message));
