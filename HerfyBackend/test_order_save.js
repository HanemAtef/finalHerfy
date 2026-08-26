require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./models/Order');

async function testSingle() {
  await mongoose.connect(process.env.MONGO_URI);
  const o = await Order.create({
    customerId: new mongoose.Types.ObjectId(),
    handymanId: new mongoose.Types.ObjectId(),
    profession: 'كهربائي',
    status: 'in-progress',
    scheduledDate: new Date(),
  });
  console.log('Created order status:', o.status);
  
  // Call updateOrderStatus logic directly
  o.status = 'completed';
  o.completedAt = new Date();
  o.completionImage = 'https://example.com/test.jpg';
  await o.save();

  const ref = await Order.findById(o._id);
  console.log('Refetched order status:', ref.status, 'completedAt:', ref.completedAt);
  await Order.deleteMany({ _id: o._id });
  process.exit(0);
}
testSingle();
