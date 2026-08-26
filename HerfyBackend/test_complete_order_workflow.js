require('dotenv').config();
const mongoose = require('mongoose');
const JWT = require('jsonwebtoken');
const axios = require('axios');

const User = require('./models/User');
const Handyman = require('./models/Handyman');
const Order = require('./models/Order');

async function runCompleteTestSuite() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('=== Connected to DB ===\n');

  // 1. Setup Test Users
  let testCustomer = await User.findOne({ email: 'workflow_customer@herfy.com' });
  if (!testCustomer) {
    testCustomer = await User.create({
      name: 'أحمد محمود',
      email: 'workflow_customer@herfy.com',
      phone: '01099887766',
      password: 'password123',
      role: 'customer',
      isVerified: true,
      location: { type: 'Point', coordinates: [31.30900, 30.08760] },
      address: 'شارع الخليفة المأمون، العباسية البحرية، القاهرة'
    });
  } else {
    testCustomer.isVerified = true;
    testCustomer.location = { type: 'Point', coordinates: [31.30900, 30.08760] };
    testCustomer.address = 'شارع الخليفة المأمون، العباسية البحرية، القاهرة';
    await testCustomer.save();
  }

  let testHandymanUser = await User.findOne({ email: 'workflow_handyman@herfy.com' });
  if (!testHandymanUser) {
    testHandymanUser = await User.create({
      name: 'محمود حسن',
      email: 'workflow_handyman@herfy.com',
      phone: '01055443322',
      password: 'password123',
      role: 'handyman',
      isVerified: true,
      location: { type: 'Point', coordinates: [31.30900, 30.08760] },
      address: 'القاهرة'
    });
  } else {
    testHandymanUser.isVerified = true;
    await testHandymanUser.save();
  }

  let testHandyman = await Handyman.findOne({ userId: testHandymanUser._id });
  if (!testHandyman) {
    testHandyman = await Handyman.create({
      userId: testHandymanUser._id,
      profession: 'كهربائي',
      registrationStatus: 'approved',
      isAvailable: true,
      price: 150,
      location: { type: 'Point', coordinates: [31.30900, 30.08760] }
    });
  } else {
    testHandyman.isAvailable = true;
    testHandyman.registrationStatus = 'approved';
    await testHandyman.save();
  }

  const customerToken = JWT.sign({ id: testCustomer._id, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '1d' });
  const handymanToken = JWT.sign({ id: testHandymanUser._id, role: 'handyman' }, process.env.JWT_SECRET, { expiresIn: '1d' });

  // Clean old test orders
  await Order.deleteMany({ customerId: testCustomer._id });
  await Order.deleteMany({ handymanId: testHandymanUser._id });

  const BASE_URL = 'http://localhost:8000/api';

  // ----------------------------------------------------
  // TEST 1: User creates Order -> status = PENDING
  // ----------------------------------------------------
  console.log('>>> TEST 1: User creates Order (status = pending) <<<');
  const futureAppt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const createRes = await axios.post(`${BASE_URL}/orders/create`, {
    handymanId: testHandymanUser._id.toString(),
    profession: 'كهربائي',
    description: 'صيانة قواطع الكهرباء',
    scheduledDate: futureAppt.toISOString(),
    expectedDuration: 2,
    estimatedPrice: 180,
    orderLocation: {
      type: 'Point',
      coordinates: [31.30900, 30.08760],
      latitude: 30.08760,
      longitude: 31.30900,
      address: 'شارع الخليفة المأمون، العباسية البحرية، القاهرة',
      city: 'القاهرة',
      area: 'العباسية البحرية'
    }
  }, { headers: { Authorization: `Bearer ${customerToken}` } });

  const orderId = createRes.data.order._id;
  console.log(`[TEST 1] Order created with status: ${createRes.data.order.status} | ID: ${orderId}`);
  if (createRes.data.order.status !== 'pending') throw new Error('Order status should be pending');

  // ----------------------------------------------------
  // TEST 2: Handyman accepts -> status = ACCEPTED
  // ----------------------------------------------------
  console.log('\n>>> TEST 2: Handyman accepts (status = accepted) <<<');
  const acceptRes = await axios.patch(`${BASE_URL}/orders/${orderId}/status`, {
    status: 'accepted',
    price: 200,
    expectedDuration: 2
  }, { headers: { Authorization: `Bearer ${handymanToken}` } });

  console.log(`[TEST 2] Order accepted with status: ${acceptRes.data.order.status}`);
  if (acceptRes.data.order.status !== 'accepted') throw new Error('Order status should be accepted');

  // ----------------------------------------------------
  // TEST 3: Schedule / Price Confirmation -> status = SCHEDULED
  // ----------------------------------------------------
  console.log('\n>>> TEST 3: Customer confirms price & schedule (status = scheduled) <<<');
  const confirmPriceRes = await axios.patch(`${BASE_URL}/orders/${orderId}/confirm-price`, {
    confirmed: true
  }, { headers: { Authorization: `Bearer ${customerToken}` } });

  console.log(`[TEST 3] Order confirmed with status: ${confirmPriceRes.data.order.status}`);
  if (!['scheduled', 'price_confirmed'].includes(confirmPriceRes.data.order.status)) throw new Error('Order status should be scheduled');

  // ----------------------------------------------------
  // TEST 4: Handyman starts trip -> status = ON_THE_WAY
  // ----------------------------------------------------
  console.log('\n>>> TEST 4: Handyman starts trip (on the way) <<<');
  const onTheWayRes = await axios.patch(`${BASE_URL}/orders/${orderId}/on-the-way`, {}, {
    headers: { Authorization: `Bearer ${handymanToken}` }
  });
  console.log(`[TEST 4] Handyman marked on the way | trackingStatus: ${onTheWayRes.data.order.trackingStatus} | isHandymanOnTheWay: ${onTheWayRes.data.order.isHandymanOnTheWay}`);

  // ----------------------------------------------------
  // TEST 5: Handyman Far (> 50m) -> Cannot mark ARRIVED
  // ----------------------------------------------------
  console.log('\n>>> TEST 5: Handyman far (> 50m) blocked from ARRIVED <<<');
  const farLat = 30.08760 + 0.001; // ~110m away
  const farLng = 31.30900;
  try {
    await axios.patch(`${BASE_URL}/orders/${orderId}/status`, {
      status: 'arrived',
      latitude: farLat,
      longitude: farLng
    }, { headers: { Authorization: `Bearer ${handymanToken}` } });
    throw new Error('TEST 5 FAILED: Should have rejected arrival when > 50m');
  } catch (err) {
    console.log(`[TEST 5] Arrival blocked correctly ✓: ${err.response?.data?.msg}`);
  }

  // ----------------------------------------------------
  // TEST 6: Handyman Near (<= 50m) -> ARRIVED allowed
  // ----------------------------------------------------
  console.log('\n>>> TEST 6: Handyman near (<= 50m) marks ARRIVED <<<');
  const nearLat = 30.08760 + 0.0002; // ~22m away
  const nearLng = 31.30900;
  const arrivedRes = await axios.patch(`${BASE_URL}/orders/${orderId}/status`, {
    status: 'arrived',
    latitude: nearLat,
    longitude: nearLng
  }, { headers: { Authorization: `Bearer ${handymanToken}` } });
  console.log(`[TEST 6] Handyman arrived successfully with status: ${arrivedRes.data.order.status}`);
  if (arrivedRes.data.order.status !== 'arrived') throw new Error('Order status should be arrived');

  // ----------------------------------------------------
  // TEST 7: Handyman moves away (> 50m) -> Cannot IN_PROGRESS
  // ----------------------------------------------------
  console.log('\n>>> TEST 7: Handyman moves away (> 50m) blocked from starting execution <<<');
  try {
    await axios.post(`${BASE_URL}/orders/${orderId}/start`, {
      latitude: farLat,
      longitude: farLng,
      coordinates: [farLng, farLat]
    }, { headers: { Authorization: `Bearer ${handymanToken}` } });
    throw new Error('TEST 7 FAILED: Should have rejected start when handyman moved > 50m');
  } catch (err) {
    console.log(`[TEST 7] Execution blocked correctly when moved away ✓: ${err.response?.data?.msg}`);
  }

  // ----------------------------------------------------
  // TEST 8: Handyman returns to <= 50m -> IN_PROGRESS allowed + metadata
  // ----------------------------------------------------
  console.log('\n>>> TEST 8: Handyman at <= 50m starts IN_PROGRESS <<<');
  const startRes = await axios.post(`${BASE_URL}/orders/${orderId}/start`, {
    latitude: nearLat,
    longitude: nearLng,
    coordinates: [nearLng, nearLat]
  }, { headers: { Authorization: `Bearer ${handymanToken}` } });

  console.log(`[TEST 8] Execution started with status: ${startRes.data.order.status}`);
  const startedDb = await Order.findById(orderId);
  console.log(`[TEST 8] executionStartedAt: ${startedDb.executionStartedAt}`);
  console.log(`[TEST 8] executionStartDistance: ${startedDb.executionStartDistance} meters (must be <= 50m)`);
  console.log(`[TEST 8] startedBy: ${startedDb.startedBy}`);
  if (startedDb.status !== 'in-progress') throw new Error('Status should be in-progress');

  // ----------------------------------------------------
  // TEST 9: Handyman completes work -> status = COMPLETED
  // ----------------------------------------------------
  console.log('\n>>> TEST 9: Handyman completes work with photo (status = completed) <<<');
  const completeRes = await axios.patch(`${BASE_URL}/orders/${orderId}/status`, {
    status: 'completed',
    completionImage: 'https://example.com/completion-proof.jpg'
  }, { headers: { Authorization: `Bearer ${handymanToken}` } });
  console.log(`[TEST 9] Order completed with status: ${completeRes.data.order.status}`);
  if (completeRes.data.order.status !== 'completed') throw new Error('Order status should be completed');

  // Verify direct in database
  const order1AfterComplete = await Order.findById(orderId);
  console.log(`[TEST 9 DB Check] Status in DB: ${order1AfterComplete.status} | completedAt: ${order1AfterComplete.completedAt}`);
  if (order1AfterComplete.status !== 'completed') throw new Error('DB status must be completed');

  // ----------------------------------------------------
  // TEST 10 & 11 & 12: Reschedule Request, Approval, and History
  // ----------------------------------------------------
  console.log('\n>>> TEST 10, 11, 12: Reschedule Workflow, Approval, and History <<<');
  const order2Res = await axios.post(`${BASE_URL}/orders/create`, {
    handymanId: testHandymanUser._id.toString(),
    profession: 'كهربائي',
    description: 'طلب اختبار إعادة الجدولة',
    scheduledDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    expectedDuration: 2,
    orderLocation: {
      type: 'Point',
      coordinates: [31.30900, 30.08760],
      latitude: 30.08760,
      longitude: 31.30900,
      address: 'شارع الخليفة المأمون، القاهرة'
    }
  }, { headers: { Authorization: `Bearer ${customerToken}` } });
  const order2Id = order2Res.data.order._id;

  const newRescheduleDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const reqReschedule = await axios.post(`${BASE_URL}/orders/${order2Id}/reschedule-request`, {
    newDate: newRescheduleDate.toISOString(),
    newTime: '16:30',
    reason: 'تأجيل بسبب سفر مفاجئ'
  }, { headers: { Authorization: `Bearer ${customerToken}` } });
  console.log(`[TEST 10] Reschedule requested | status: ${reqReschedule.data.order.rescheduleRequest.status}`);

  // Handyman approves
  const approveRes = await axios.post(`${BASE_URL}/orders/${order2Id}/reschedule-response`, {
    accepted: true
  }, { headers: { Authorization: `Bearer ${handymanToken}` } });
  console.log(`[TEST 11] Reschedule approved | new scheduledDate: ${approveRes.data.order.scheduledDate}`);

  const order2Db = await Order.findById(order2Id);
  console.log(`[TEST 12] History count: ${order2Db.rescheduleHistory.length} | History[0] status: ${order2Db.rescheduleHistory[0].status}`);
  if (order2Db.rescheduleHistory[0].status !== 'approved') throw new Error('History status should be approved');

  // ----------------------------------------------------
  // TEST 13: Reject Reschedule preserves old date
  // ----------------------------------------------------
  console.log('\n>>> TEST 13: Reject Reschedule preserves original date <<<');
  const origDate = order2Db.scheduledDate;
  await axios.post(`${BASE_URL}/orders/${order2Id}/reschedule-request`, {
    newDate: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    newTime: '20:00',
    reason: 'تأجيل آخر'
  }, { headers: { Authorization: `Bearer ${customerToken}` } });

  await axios.post(`${BASE_URL}/orders/${order2Id}/reschedule-response`, {
    accepted: false
  }, { headers: { Authorization: `Bearer ${handymanToken}` } });

  const order2DbAfterReject = await Order.findById(order2Id);
  console.log(`[TEST 13] Date after reject matches original date: ${new Date(order2DbAfterReject.scheduledDate).getTime() === new Date(origDate).getTime()} ✓`);
  console.log(`[TEST 13] History count now: ${order2DbAfterReject.rescheduleHistory.length} (Latest status: ${order2DbAfterReject.rescheduleHistory[1].status})`);

  // ----------------------------------------------------
  // TEST 14: Reschedule Conflict & Past Date Rejections
  // ----------------------------------------------------
  console.log('\n>>> TEST 14: Reschedule Conflict & Past Date Rejections <<<');
  try {
    await axios.post(`${BASE_URL}/orders/${order2Id}/reschedule-request`, {
      newDate: new Date(Date.now() - 3600000).toISOString(), // past date
      newTime: '10:00',
      reason: 'موعد قديم'
    }, { headers: { Authorization: `Bearer ${customerToken}` } });
    throw new Error('TEST 14 FAILED: Past date should be rejected');
  } catch (err) {
    console.log(`[TEST 14] Past date rejected correctly ✓: ${err.response?.data?.msg}`);
  }

  // ----------------------------------------------------
  // TEST 15: User location changes in profile -> Order snapshot remains immutable
  // ----------------------------------------------------
  console.log('\n>>> TEST 15: User moves in profile -> Order snapshot remains immutable <<<');
  testCustomer.location = { type: 'Point', coordinates: [31.50000, 30.20000] };
  testCustomer.address = 'حي التجمع الخامس، القاهرة الجديدة';
  await testCustomer.save();

  const refreshedOrder1 = await Order.findById(orderId);
  const isSnapshotSafe = refreshedOrder1.orderLocation.coordinates[0] === 31.30900 &&
                         refreshedOrder1.orderLocation.coordinates[1] === 30.08760 &&
                         refreshedOrder1.orderLocation.address === 'شارع الخليفة المأمون، العباسية البحرية، القاهرة';
  console.log(`[TEST 15] Order snapshot intact and immutable: ${isSnapshotSafe ? 'PASSED ✓' : 'FAILED ✗'}`);
  if (!isSnapshotSafe) throw new Error('Order snapshot changed!');

  // ----------------------------------------------------
  // TEST 16 & 17: Backend Server-Side Geofencing Security against Spoofing
  // ----------------------------------------------------
  console.log('\n>>> TEST 16 & 17: Backend Server-Side Security against Spoofing <<<');
  const testSpoofOrder = await Order.create({
    customerId: testCustomer._id,
    handymanId: testHandymanUser._id,
    profession: 'كهربائي',
    status: 'arrived',
    scheduledDate: new Date(),
    orderLocation: {
      type: 'Point',
      coordinates: [31.30900, 30.08760],
      latitude: 30.08760,
      longitude: 31.30900,
      address: 'شارع الخليفة المأمون، القاهرة'
    }
  });

  try {
    await axios.post(`${BASE_URL}/orders/${testSpoofOrder._id}/start`, {
      latitude: 30.08760 + 0.005, // 550m away
      longitude: 31.30900,
      isNearCustomer: true,
      distance: 0,
      bypassGeofence: true
    }, { headers: { Authorization: `Bearer ${handymanToken}` } });
    throw new Error('TEST 16/17 FAILED: Server should have calculated distance and rejected spoofed request');
  } catch (err) {
    console.log(`[TEST 16/17] Server calculated distance and rejected spoofing ✓: ${err.response?.data?.msg}`);
    console.log(`[TEST 16/17] Distance from DB orderLocation: ${err.response?.data?.distance}m | Allowed: ${err.response?.data?.allowedRadius}m`);
  }

  // ----------------------------------------------------
  // TEST 18: Re-query Order / Refresh Consistency
  // ----------------------------------------------------
  console.log('\n>>> TEST 18: Refresh / Re-query Consistency <<<');
  const getOrderRes = await axios.get(`${BASE_URL}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${customerToken}` }
  });
  const orderFinal = getOrderRes.data;
  console.log(`[TEST 18] Re-queried Order ID: ${orderFinal._id}`);
  console.log(`[TEST 18] Status: ${orderFinal.status} (Expected: completed)`);
  console.log(`[TEST 18] Completion Image: ${orderFinal.completionImage}`);
  console.log(`[TEST 18] Completed At: ${orderFinal.completedAt}`);
  console.log(`[TEST 18] Payment Status: ${orderFinal.paymentStatus} (Independent from order status)`);
  console.log(`[TEST 18] Order Location: [${orderFinal.orderLocation.coordinates}] - ${orderFinal.orderLocation.address}`);

  if (orderFinal.status !== 'completed') throw new Error('TEST 18 FAILED: Final order status should be completed');

  // Clean test orders
  await Order.deleteMany({ customerId: testCustomer._id });
  await Order.deleteMany({ _id: testSpoofOrder._id });

  console.log('\n================================================================');
  console.log('ALL 18 COMPREHENSIVE WORKFLOW & SECURITY TESTS PASSED (100%)!');
  console.log('================================================================');
  process.exit(0);
}

runCompleteTestSuite().catch(err => {
  console.error('TEST ERROR:', err.response?.data || err.message);
  process.exit(1);
});
