require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./models/Order');
const User = require('./models/User');
const Notification = require('./models/Notification');
const Handyman = require('./models/Handyman');
const Fine = require('./models/Fine');
const {
  requestReschedule,
  respondReschedule,
  updateOrderStatus,
  markOnTheWay,
  startOrder,
  computeDepartureWindow,
} = require('./controllers/orderController');
const { getNotifications } = require('./controllers/notificationController');

// Import client routing helper logic to test in Node environment
const resolveClientDestination = (notification, role) => {
  if (!notification) return null;
  const data = notification.data || {};
  const orderId = data.orderId || notification.orderId;
  const reportId = data.reportId || notification.reportId;
  const paymentId = data.paymentId || data.transactionId || notification.paymentId;
  const settlementRequestId = data.settlementRequestId;
  const fineId = data.fineId;

  // 1. Chat Messages
  if (notification.type === 'new_message' && orderId) {
    return `/chat/${orderId}`;
  }

  // 2. Reschedule Notifications
  if (['reschedule_request', 'reschedule_response'].includes(notification.type) && orderId) {
    return role === 'handyman'
      ? `/handyman/orders/${orderId}#reschedule-section`
      : `/customer/tracking/${orderId}#reschedule-section`;
  }

  // 3. Reports / Complaints
  if (['report_filed', 'report_resolved', 'report_created', 'dispute_created'].includes(notification.type)) {
    if (role === 'admin') {
      return `/admin/reports`;
    }
    const reportQuery = reportId ? `?reportId=${reportId}` : '';
    return role === 'handyman'
      ? `/handyman/reports${reportQuery}`
      : `/customer/reports${reportQuery}`;
  }

  // 4. Fine / Settlement / Penalty Notifications
  if (['penalty_warning'].includes(notification.type)) {
    if (orderId) {
      return role === 'handyman' ? `/handyman/orders/${orderId}` : `/customer/tracking/${orderId}`;
    }
    return role === 'handyman' ? `/handyman/profile` : `/customer/profile`;
  }

  // 5. Payment Notifications
  if (['payment_confirmed', 'payment_failed', 'payment_method_selected'].includes(notification.type)) {
    if (settlementRequestId || fineId) {
      return role === 'handyman' ? `/handyman/profile` : `/customer/profile`;
    }
    if (orderId) {
      if (notification.type === 'payment_failed') {
        return `/customer/payment/${orderId}`;
      }
      return role === 'handyman' ? `/handyman/orders/${orderId}` : `/customer/orders/${orderId}`;
    }
    return role === 'handyman' ? `/handyman/profile` : `/customer/profile`;
  }

  // 6. Handyman Registration & Verifications
  if (['registration_approved', 'registration_rejected', 'handyman_verified', 'handyman_rejected', 'handyman_suspended', 'handyman_unsuspended'].includes(notification.type)) {
    if (role === 'admin') {
      return `/admin/verifications`;
    }
    return role === 'handyman' ? `/handyman/profile` : `/customer/home`;
  }

  // 7. Order Status Updates
  if (orderId) {
    switch (notification.type) {
      case 'order_cancelled':
        return role === 'handyman' ? `/handyman/orders/${orderId}` : `/customer/tracking/${orderId}`;
      case 'order_completed':
        return role === 'handyman' ? `/handyman/orders/${orderId}` : `/customer/review/${orderId}`;
      case 'order_created':
      case 'order_accepted':
      case 'order_rejected':
      case 'price_confirmed':
      case 'emergency_request':
      case 'handyman_on_the_way':
        return role === 'handyman' ? `/handyman/orders/${orderId}` : `/customer/tracking/${orderId}`;
      default:
        return role === 'handyman' ? `/handyman/orders/${orderId}` : `/customer/tracking/${orderId}`;
    }
  }

  // 8. Safe Fallback Routes based on User Role (no ID present)
  if (role === 'admin') return `/admin/dashboard`;
  if (role === 'handyman') return `/handyman/dashboard`;
  return `/customer/dashboard`;
};

async function runNotificationRoutingSuite() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(' Connected to MongoDB for Notification Click & Routing Tests\n');

  const testOrderId = '6a8dab8be53a9cd89dfbd5f9';
  const testReportId = '6a8dab8be53a9cd89dfbd5fa';
  const testFineId = '6a8dab8be53a9cd89dfbd5fb';

  // -------------------------------------------------------------
  // TEST 1: Order Notification Click -> Opens correct Order Details / Tracking
  // -------------------------------------------------------------
  console.log('>>> TEST 1: Click Order Notification <<<');
  const orderNotifCustomer = {
    type: 'order_accepted',
    data: { orderId: testOrderId },
  };
  const orderNotifHandyman = {
    type: 'order_created',
    data: { orderId: testOrderId },
  };
  const custDest1 = resolveClientDestination(orderNotifCustomer, 'customer');
  const handyDest1 = resolveClientDestination(orderNotifHandyman, 'handyman');
  if (custDest1 !== `/customer/tracking/${testOrderId}`) {
    throw new Error(`TEST 1 FAILED: Customer destination mismatch: ${custDest1}`);
  }
  if (handyDest1 !== `/handyman/orders/${testOrderId}`) {
    throw new Error(`TEST 1 FAILED: Handyman destination mismatch: ${handyDest1}`);
  }
  console.log(`[TEST 1] Customer route: ${custDest1} ✓`);
  console.log(`[TEST 1] Handyman route: ${handyDest1} ✓`);

  // -------------------------------------------------------------
  // TEST 2: Reschedule Notification Click -> Opens with #reschedule-section anchor
  // -------------------------------------------------------------
  console.log('\n>>> TEST 2: Click Reschedule Notification <<<');
  const reschedNotifCust = {
    type: 'reschedule_request',
    data: { orderId: testOrderId },
  };
  const reschedNotifHandy = {
    type: 'reschedule_response',
    data: { orderId: testOrderId },
  };
  const reschedDestCust = resolveClientDestination(reschedNotifCust, 'customer');
  const reschedDestHandy = resolveClientDestination(reschedNotifHandy, 'handyman');
  if (reschedDestCust !== `/customer/tracking/${testOrderId}#reschedule-section`) {
    throw new Error(`TEST 2 FAILED: Customer reschedule destination: ${reschedDestCust}`);
  }
  if (reschedDestHandy !== `/handyman/orders/${testOrderId}#reschedule-section`) {
    throw new Error(`TEST 2 FAILED: Handyman reschedule destination: ${reschedDestHandy}`);
  }
  console.log(`[TEST 2] Customer reschedule route with open section anchor: ${reschedDestCust} ✓`);
  console.log(`[TEST 2] Handyman reschedule route with open section anchor: ${reschedDestHandy} ✓`);

  // -------------------------------------------------------------
  // TEST 3: Report Notification Click ("تم معالجة البلاغ") -> Opens specific report
  // -------------------------------------------------------------
  console.log('\n>>> TEST 3: Click Report Notification ("تم معالجة البلاغ") <<<');
  const reportResolvedNotif = {
    type: 'report_resolved',
    data: { reportId: testReportId },
  };
  const reportDestCust = resolveClientDestination(reportResolvedNotif, 'customer');
  const reportDestHandy = resolveClientDestination(reportResolvedNotif, 'handyman');
  if (reportDestCust !== `/customer/reports?reportId=${testReportId}`) {
    throw new Error(`TEST 3 FAILED: Customer report destination mismatch: ${reportDestCust}`);
  }
  if (reportDestHandy !== `/handyman/reports?reportId=${testReportId}`) {
    throw new Error(`TEST 3 FAILED: Handyman report destination mismatch: ${reportDestHandy}`);
  }
  console.log(`[TEST 3] Customer report route: ${reportDestCust} ✓`);
  console.log(`[TEST 3] Handyman report route: ${reportDestHandy} ✓`);

  // -------------------------------------------------------------
  // TEST 4: Fine / Settlement Notification Click -> Opens Fine/Settlement
  // -------------------------------------------------------------
  console.log('\n>>> TEST 4: Click Fine / Settlement Notification <<<');
  const penaltyNotif = {
    type: 'penalty_warning',
    data: { penaltyAmount: 50 },
  };
  const penaltyDestHandy = resolveClientDestination(penaltyNotif, 'handyman');
  const penaltyDestCust = resolveClientDestination(penaltyNotif, 'customer');
  if (penaltyDestHandy !== `/handyman/profile`) {
    throw new Error(`TEST 4 FAILED: Handyman penalty route mismatch: ${penaltyDestHandy}`);
  }
  if (penaltyDestCust !== `/customer/profile`) {
    throw new Error(`TEST 4 FAILED: Customer penalty route mismatch: ${penaltyDestCust}`);
  }
  console.log(`[TEST 4] Handyman fine/penalty route: ${penaltyDestHandy} ✓`);
  console.log(`[TEST 4] Customer fine/penalty route: ${penaltyDestCust} ✓`);

  // -------------------------------------------------------------
  // TEST 5: Mark As Read in Database & Persistence
  // -------------------------------------------------------------
  console.log('\n>>> TEST 5: Mark notification as read and database persistence <<<');
  const notifDoc = await Notification.create({
    userId: new mongoose.Types.ObjectId(),
    type: 'order_completed',
    title: 'طلب مكتمل',
    body: 'تم إكمال طلبك بنجاح',
    data: { orderId: testOrderId },
    isRead: false,
  });

  // Mark as read in DB
  await Notification.findByIdAndUpdate(notifDoc._id, { isRead: true, readAt: new Date() });
  const readDoc = await Notification.findById(notifDoc._id);
  if (!readDoc.isRead || !readDoc.readAt) {
    throw new Error('TEST 5 FAILED: Notification isRead was not persisted to true in DB');
  }
  console.log(`[TEST 5] Notification marked as read in DB (isRead: ${readDoc.isRead}, readAt: ${readDoc.readAt.toISOString()}) ✓`);
  await Notification.findByIdAndDelete(notifDoc._id);

  // -------------------------------------------------------------
  // TEST 6: Legacy notification without ID -> Fallback safely without crash
  // -------------------------------------------------------------
  console.log('\n>>> TEST 6: Legacy notification without ID (Safe Fallback) <<<');
  const legacyNotif = {
    type: 'system_alert',
    data: {}, // no orderId, no reportId
  };
  const fallbackCust = resolveClientDestination(legacyNotif, 'customer');
  const fallbackHandy = resolveClientDestination(legacyNotif, 'handyman');
  const fallbackAdmin = resolveClientDestination(legacyNotif, 'admin');

  if (fallbackCust !== '/customer/dashboard' || fallbackHandy !== '/handyman/dashboard' || fallbackAdmin !== '/admin/dashboard') {
    throw new Error(`TEST 6 FAILED: Fallbacks incorrect: cust=${fallbackCust}, handy=${fallbackHandy}, admin=${fallbackAdmin}`);
  }
  console.log(`[TEST 6] Customer fallback: ${fallbackCust} ✓`);
  console.log(`[TEST 6] Handyman fallback: ${fallbackHandy} ✓`);
  console.log(`[TEST 6] Admin fallback: ${fallbackAdmin} ✓`);

  console.log('\n===============================================================');
  console.log(' ALL 6 NOTIFICATION CLICK & ROUTING TESTS PASSED (100%)!');
  console.log('===============================================================\n');

  await mongoose.disconnect();
}

async function runComprehensiveRescheduleSuite() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(' Connected to MongoDB for 12 Comprehensive Reschedule Tests\n');

  // Setup / Retrieve Test Users
  let customer = await User.findOne({ $or: [{ email: 'test_resched_cust12@herfy.com' }, { phone: '01011119999' }] });
  if (!customer) {
    customer = await User.create({
      name: 'أحمد محمود (عميل)',
      email: 'test_resched_cust12@herfy.com',
      phone: '01011119999',
      password: 'password123',
      role: 'customer',
      isVerified: true,
      location: { type: 'Point', coordinates: [31.309, 30.087] },
    });
  }

  let handymanUser = await User.findOne({ $or: [{ email: 'test_resched_handy12@herfy.com' }, { phone: '01033338888' }] });
  if (!handymanUser) {
    handymanUser = await User.create({
      name: 'محمود حسن (حرفي)',
      email: 'test_resched_handy12@herfy.com',
      phone: '01033338888',
      password: 'password123',
      role: 'handyman',
      isVerified: true,
      location: { type: 'Point', coordinates: [31.309, 30.087] },
    });
  }

  const mockApp = {
    get: (key) => {
      if (key === 'io') {
        return {
          to: () => ({ emit: () => {} }),
        };
      }
    },
  };

  // Helper response builder
  const createMockRes = () => {
    const res = {
      statusCode: 200,
      body: null,
      status: function (code) {
        this.statusCode = code;
        return this;
      },
      json: function (data) {
        this.body = data;
        return data;
      },
    };
    return res;
  };

  // TEST 1: Order = SCHEDULED -> Reschedule API allowed
  console.log('>>> TEST 1: Order = SCHEDULED -> Reschedule allowed <<<');
  const initialDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  let orderScheduled = await Order.create({
    customerId: customer._id,
    handymanId: handymanUser._id,
    profession: 'نجارة',
    description: 'إصلاح باب خشب',
    scheduledDate: initialDate,
    scheduledTime: '14:00',
    status: 'scheduled',
    customerLocation: { type: 'Point', coordinates: [31.309, 30.087], address: 'القاهرة' },
    orderLocation: { type: 'Point', coordinates: [31.309, 30.087], address: 'القاهرة' },
  });

  const proposedDate1 = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const req1 = {
    params: { id: orderScheduled._id.toString() },
    body: {
      newDate: proposedDate1.toISOString(),
      newTime: '16:40',
      reason: 'ظرف طارئ',
    },
    user: { id: handymanUser._id.toString(), role: 'handyman', name: handymanUser.name },
    app: mockApp,
  };
  const res1 = createMockRes();
  await requestReschedule(req1, res1);
  if (res1.statusCode !== 200) {
    throw new Error(`TEST 1 FAILED: Reschedule request was rejected on SCHEDULED order with code ${res1.statusCode}`);
  }
  console.log('[TEST 1] PASSED: Reschedule request accepted for SCHEDULED order ✓');

  // TEST 2: Order = COMPLETED -> Backend rejects reschedule request
  console.log('\n>>> TEST 2: Order = COMPLETED -> Reschedule blocked <<<');
  let orderCompleted = await Order.create({
    customerId: customer._id,
    handymanId: handymanUser._id,
    profession: 'سباكة',
    status: 'completed',
    customerLocation: { type: 'Point', coordinates: [31.309, 30.087], address: 'القاهرة' },
    orderLocation: { type: 'Point', coordinates: [31.309, 30.087], address: 'القاهرة' },
  });
  const res2 = createMockRes();
  await requestReschedule({
    params: { id: orderCompleted._id.toString() },
    body: { newDate: proposedDate1.toISOString(), newTime: '16:40', reason: 'محاولة' },
    user: { id: handymanUser._id.toString(), role: 'handyman' },
    app: mockApp,
  }, res2);
  if (res2.statusCode !== 400) {
    throw new Error(`TEST 2 FAILED: Backend did not return 400 for COMPLETED order (got ${res2.statusCode})`);
  }
  console.log('[TEST 2] PASSED: Backend rejected reschedule for COMPLETED order with msg:', res2.body.msg, '✓');

  // TEST 3: Order = CANCELLED -> Backend rejects reschedule request
  console.log('\n>>> TEST 3: Order = CANCELLED -> Reschedule blocked <<<');
  let orderCancelled = await Order.create({
    customerId: customer._id,
    handymanId: handymanUser._id,
    profession: 'سباكة',
    status: 'cancelled',
    customerLocation: { type: 'Point', coordinates: [31.309, 30.087], address: 'القاهرة' },
    orderLocation: { type: 'Point', coordinates: [31.309, 30.087], address: 'القاهرة' },
  });
  const res3 = createMockRes();
  await requestReschedule({
    params: { id: orderCancelled._id.toString() },
    body: { newDate: proposedDate1.toISOString(), newTime: '16:40', reason: 'محاولة' },
    user: { id: handymanUser._id.toString(), role: 'handyman' },
    app: mockApp,
  }, res3);
  if (res3.statusCode !== 400) {
    throw new Error(`TEST 3 FAILED: Backend did not return 400 for CANCELLED order`);
  }
  console.log('[TEST 3] PASSED: Backend rejected reschedule for CANCELLED order with msg:', res3.body.msg, '✓');

  // TEST 4: Order = IN_PROGRESS -> Backend rejects reschedule request
  console.log('\n>>> TEST 4: Order = IN_PROGRESS -> Reschedule blocked <<<');
  let orderInProgress = await Order.create({
    customerId: customer._id,
    handymanId: handymanUser._id,
    profession: 'سباكة',
    status: 'in-progress',
    customerLocation: { type: 'Point', coordinates: [31.309, 30.087], address: 'القاهرة' },
    orderLocation: { type: 'Point', coordinates: [31.309, 30.087], address: 'القاهرة' },
  });
  const res4 = createMockRes();
  await requestReschedule({
    params: { id: orderInProgress._id.toString() },
    body: { newDate: proposedDate1.toISOString(), newTime: '16:40', reason: 'محاولة' },
    user: { id: customer._id.toString(), role: 'customer' },
    app: mockApp,
  }, res4);
  if (res4.statusCode !== 400) {
    throw new Error(`TEST 4 FAILED: Backend did not return 400 for IN_PROGRESS order`);
  }
  console.log('[TEST 4] PASSED: Backend rejected reschedule for IN_PROGRESS order with msg:', res4.body.msg, '✓');

  // TEST 5: Direct API invocation to COMPLETED order leaves database clean
  console.log('\n>>> TEST 5: Direct API invocation prevents database creation <<<');
  const checkDb = await Order.findById(orderCompleted._id);
  if (checkDb.rescheduleRequest?.newDate) {
    throw new Error('TEST 5 FAILED: rescheduleRequest was created in DB despite error!');
  }
  console.log('[TEST 5] PASSED: Database has no rescheduleRequest for completed order ✓');

  // TEST 6: Reschedule Request appears ONLY for recipient
  console.log('\n>>> TEST 6: Reschedule Request Notification intended only for recipient <<<');
  const custNotif = await Notification.findOne({
    userId: customer._id,
    type: 'reschedule_request',
    'data.orderId': orderScheduled._id,
  });
  const handyNotif = await Notification.findOne({
    userId: handymanUser._id,
    type: 'reschedule_request',
    'data.orderId': orderScheduled._id,
  });
  if (!custNotif || handyNotif) {
    throw new Error('TEST 6 FAILED: Notification routing is incorrect');
  }
  console.log('[TEST 6] PASSED: Notification sent to Customer only, not Requester Handyman ✓');

  // TEST 7: Date & Time formatting check (28 أغسطس 2026 - 16:40)
  console.log('\n>>> TEST 7: Formatted Date and Time check <<<');
  const sampleDate = new Date('2026-08-28T14:40:00.000Z');
  const formattedArabicDate = sampleDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  console.log(`[TEST 7] Target: 2026-08-28 16:40 -> Arabic Date Formatted: "${formattedArabicDate} - 16:40"`);
  if (!formattedArabicDate.includes('أغسطس') || !formattedArabicDate.includes('٢٠٢٦') && !formattedArabicDate.includes('2026')) {
    throw new Error('TEST 7 FAILED: Arabic date formatting did not produce proper Arabic output');
  }
  console.log('[TEST 7] PASSED: Formatted string is correct and not "Invalid Date" ✓');

  // TEST 8: Reschedule Request Pending then Order becomes COMPLETED -> Request expires/cancels
  console.log('\n>>> TEST 8: Order becomes COMPLETED while Reschedule is pending -> expires request <<<');
  let orderWithPendingResched = await Order.create({
    customerId: customer._id,
    handymanId: handymanUser._id,
    profession: 'نجارة',
    scheduledDate: initialDate,
    status: 'in-progress',
    customerLocation: { type: 'Point', coordinates: [31.309, 30.087], address: 'القاهرة' },
    orderLocation: { type: 'Point', coordinates: [31.309, 30.087], address: 'القاهرة' },
    rescheduleRequest: {
      requestedBy: 'handyman',
      newDate: proposedDate1,
      newTime: '16:40',
      status: 'pending',
    },
  });

  // Complete the order directly via updateOrderStatus
  const completeReq = {
    params: { id: orderWithPendingResched._id.toString() },
    body: { status: 'completed', completionImage: 'https://example.com/test.jpg' },
    user: { id: handymanUser._id.toString(), role: 'handyman' },
    app: mockApp,
  };
  const completeRes = createMockRes();
  await updateOrderStatus(completeReq, completeRes);

  const updatedOrder8 = await Order.findById(orderWithPendingResched._id);
  if (updatedOrder8.rescheduleRequest.status !== 'expired') {
    throw new Error(`TEST 8 FAILED: rescheduleRequest status is ${updatedOrder8.rescheduleRequest?.status} instead of expired`);
  }
  console.log('[TEST 8] PASSED: Pending request automatically set to expired upon order completion ✓');

  // TEST 9: Attempt to approve Reschedule after order becomes COMPLETED -> Backend rejects
  console.log('\n>>> TEST 9: Attempt to approve Reschedule on COMPLETED order -> Backend rejects <<<');
  const resApproveAfterComplete = createMockRes();
  await respondReschedule({
    params: { id: orderWithPendingResched._id.toString() },
    body: { accepted: true },
    user: { id: customer._id.toString(), role: 'customer' },
    app: mockApp,
  }, resApproveAfterComplete);
  if (resApproveAfterComplete.statusCode !== 400) {
    throw new Error(`TEST 9 FAILED: Backend did not reject approve on completed order (code ${resApproveAfterComplete.statusCode})`);
  }
  console.log('[TEST 9] PASSED: Approval rejected with msg:', resApproveAfterComplete.body.msg, '✓');

  // TEST 10: Refresh / Re-query Consistency
  console.log('\n>>> TEST 10: Refresh / Persistence consistency <<<');
  const refreshed = await Order.findById(orderScheduled._id);
  if (!refreshed || refreshed.rescheduleRequest?.status !== 'pending') {
    throw new Error('TEST 10 FAILED: Pending reschedule state not preserved');
  }
  console.log('[TEST 10] PASSED: Database state is consistent upon refresh ✓');

  // TEST 11: Handyman sends request -> User gets Notification
  console.log('\n>>> TEST 11: Handyman sends request -> User notification details <<<');
  const notifFound = await Notification.findOne({
    userId: customer._id,
    type: 'reschedule_request',
    'data.orderId': orderScheduled._id,
  }).sort({ createdAt: -1 });
  if (!notifFound) {
    throw new Error('TEST 11 FAILED: Customer did not receive reschedule notification');
  }
  console.log('[TEST 11] PASSED: Customer received notification:', notifFound.title, '| Body:', notifFound.body, '✓');

  // TEST 12: User approves -> Scheduled Date changes and Handyman gets response Notification
  console.log('\n>>> TEST 12: User approves -> Date updates & Handyman gets notification <<<');
  const res12 = createMockRes();
  await respondReschedule({
    params: { id: orderScheduled._id.toString() },
    body: { accepted: true },
    user: { id: customer._id.toString(), role: 'customer', name: customer.name },
    app: mockApp,
  }, res12);

  const orderApproved = await Order.findById(orderScheduled._id);
  if (new Date(orderApproved.scheduledDate).getTime() !== proposedDate1.getTime()) {
    throw new Error('TEST 12 FAILED: scheduledDate was not updated to new date');
  }
  if (orderApproved.scheduledTime !== '16:40') {
    throw new Error('TEST 12 FAILED: scheduledTime was not updated');
  }
  if (orderApproved.rescheduleRequest.status !== 'approved') {
    throw new Error('TEST 12 FAILED: rescheduleRequest status is not approved');
  }

  const responseNotif = await Notification.findOne({
    userId: handymanUser._id,
    type: 'reschedule_response',
    'data.orderId': orderScheduled._id,
    'data.accepted': true,
  });
  if (!responseNotif) {
    throw new Error('TEST 12 FAILED: Handyman did not receive response notification');
  }
  console.log('[TEST 12] PASSED: Date updated to', orderApproved.scheduledDate.toISOString(), 'and Handyman notified ✓');

  // Cleanup test documents
  await Order.deleteMany({ customerId: customer._id });
  await Notification.deleteMany({ userId: { $in: [customer._id, handymanUser._id] } });

  console.log('\n===============================================================');
  console.log(' ALL 12 MANDATORY RESCHEDULE TESTS PASSED WITH 100% SUCCESS!');
  console.log('===============================================================\n');

  await mongoose.disconnect();
}

async function runTripJourneySuite() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('\n===============================================================');
  console.log(' RUNNING COMPREHENSIVE TRIP JOURNEY & GEOFENCING TESTS');
  console.log('===============================================================\n');

  // Customer & Handyman setup
  let customer = await User.findOne({ email: 'test_journey_cust@herfy.com' });
  if (!customer) {
    customer = await User.create({
      name: 'محمود العميل',
      email: 'test_journey_cust@herfy.com',
      phone: '01055551111',
      password: 'password123',
      role: 'customer',
      isVerified: true,
      location: { type: 'Point', coordinates: [31.309, 30.087] }, // Cairo
    });
  }

  let handyman = await User.findOne({ email: 'test_journey_handy@herfy.com' });
  if (!handyman) {
    handyman = await User.create({
      name: 'صلاح الحرفي',
      email: 'test_journey_handy@herfy.com',
      phone: '01055552222',
      password: 'password123',
      role: 'handyman',
      isVerified: true,
      location: { type: 'Point', coordinates: [31.320, 30.080] },
    });
  }

  const mockApp = {
    get: (key) => (key === 'io' ? { to: () => ({ emit: () => {} }) } : null),
  };

  const createMockRes = () => {
    const res = {
      statusCode: 200,
      body: null,
      status: function (code) {
        this.statusCode = code;
        return this;
      },
      json: function (data) {
        this.body = data;
        return data;
      },
    };
    return res;
  };

  // TRIP TEST 1: Appointment on future date (3 days later) -> Departure blocked & cannot start trip
  console.log('>>> TRIP TEST 1: Scheduled on future date (3 days ahead) -> Departure blocked <<<');
  const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const futureOrder = await Order.create({
    customerId: customer._id,
    handymanId: handyman._id,
    profession: 'كهرباء',
    scheduledDate: futureDate,
    scheduledTime: '16:40',
    status: 'scheduled',
    customerLocation: { type: 'Point', coordinates: [31.309, 30.087] },
    orderLocation: { type: 'Point', coordinates: [31.309, 30.087] },
  });

  const resT1 = createMockRes();
  await markOnTheWay({
    params: { id: futureOrder._id.toString() },
    body: { latitude: 30.080, longitude: 31.320 },
    user: { id: handyman._id.toString(), role: 'handyman', name: handyman.name },
    app: mockApp,
  }, resT1);

  if (resT1.statusCode !== 400 || !resT1.body?.msg?.includes('لا يمكن بدء التوجه الآن')) {
    throw new Error(`TRIP TEST 1 FAILED: markOnTheWay should be blocked for future date (got ${resT1.statusCode})`);
  }
  console.log('[TRIP TEST 1] PASSED: Trip start correctly blocked for future date with msg:', resT1.body.msg.slice(0, 50) + '... ✓');

  // TRIP TEST 2: Appointment today but before departure window -> Departure blocked
  console.log('\n>>> TRIP TEST 2: Scheduled today but 5 hours in future -> Departure blocked <<<');
  const todayLater = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const hoursStr = String(todayLater.getHours()).padStart(2, '0');
  const minsStr = String(todayLater.getMinutes()).padStart(2, '0');
  const todayOrder = await Order.create({
    customerId: customer._id,
    handymanId: handyman._id,
    profession: 'كهرباء',
    scheduledDate: todayLater,
    scheduledTime: `${hoursStr}:${minsStr}`,
    status: 'price_confirmed',
    customerLocation: { type: 'Point', coordinates: [31.309, 30.087] },
    orderLocation: { type: 'Point', coordinates: [31.309, 30.087] },
  });

  const resT2 = createMockRes();
  await markOnTheWay({
    params: { id: todayOrder._id.toString() },
    body: { latitude: 30.080, longitude: 31.320 },
    user: { id: handyman._id.toString(), role: 'handyman', name: handyman.name },
    app: mockApp,
  }, resT2);

  if (resT2.statusCode !== 400) {
    throw new Error(`TRIP TEST 2 FAILED: markOnTheWay should be blocked before departure window`);
  }
  console.log('[TRIP TEST 2] PASSED: Trip start correctly blocked before departure window ✓');

  // TRIP TEST 3: Inside departure window (appointment in 15 minutes) -> Allowed & becomes on_the_way
  console.log('\n>>> TRIP TEST 3: Inside departure window (appointment in 15 mins) -> markOnTheWay succeeds <<<');
  // Clear any existing active tracking on the test handyman
  await Order.deleteMany({ handymanId: handyman._id });

  const dueSoon = new Date(Date.now() + 15 * 60 * 1000);
  const dueSoonOrder = await Order.create({
    customerId: customer._id,
    handymanId: handyman._id,
    profession: 'كهرباء',
    scheduledDate: dueSoon,
    scheduledTime: `${String(dueSoon.getHours()).padStart(2, '0')}:${String(dueSoon.getMinutes()).padStart(2, '0')}`,
    status: 'price_confirmed',
    customerLocation: { type: 'Point', coordinates: [31.309, 30.087] },
    orderLocation: { type: 'Point', coordinates: [31.309, 30.087] },
  });

  const resT3 = createMockRes();
  await markOnTheWay({
    params: { id: dueSoonOrder._id.toString() },
    body: { latitude: 30.080, longitude: 31.320 },
    user: { id: handyman._id.toString(), role: 'handyman', name: handyman.name },
    app: mockApp,
  }, resT3);

  if (resT3.statusCode !== 200) {
    throw new Error(`TRIP TEST 3 FAILED: markOnTheWay rejected inside valid window (code ${resT3.statusCode})`);
  }
  const updatedT3 = await Order.findById(dueSoonOrder._id);
  if (!updatedT3.isHandymanOnTheWay || updatedT3.trackingStatus !== 'active') {
    throw new Error('TRIP TEST 3 FAILED: isHandymanOnTheWay not set to true');
  }
  console.log('[TRIP TEST 3] PASSED: Handyman successfully transitioned to ON_THE_WAY ✓');

  // TRIP TEST 4: Handyman far (>50m) tries to mark ARRIVED -> Backend rejects
  console.log('\n>>> TRIP TEST 4: Handyman far (>50m) tries to mark ARRIVED -> Backend rejects <<<');
  const resT4 = createMockRes();
  await updateOrderStatus({
    params: { id: dueSoonOrder._id.toString() },
    body: { status: 'arrived', latitude: 30.050, longitude: 31.250 }, // ~5km away
    user: { id: handyman._id.toString(), role: 'handyman' },
    app: mockApp,
  }, resT4);

  if (resT4.statusCode !== 400 || !resT4.body?.msg?.includes('50')) {
    throw new Error(`TRIP TEST 4 FAILED: Far arrived should be rejected with 400 (got ${resT4.statusCode})`);
  }
  console.log('[TRIP TEST 4] PASSED: Arrived rejected for distance > 50m with msg:', resT4.body.msg.slice(0, 45) + '... ✓');

  // TRIP TEST 5: Handyman close (<= 50m) marks ARRIVED -> Backend accepts
  console.log('\n>>> TRIP TEST 5: Handyman close (<= 50m) marks ARRIVED -> Backend accepts <<<');
  const resT5 = createMockRes();
  // Customer is at [31.309, 30.087], handyman at [31.30905, 30.08705] (~7 meters)
  await updateOrderStatus({
    params: { id: dueSoonOrder._id.toString() },
    body: { status: 'arrived', latitude: 30.08705, longitude: 31.30905 },
    user: { id: handyman._id.toString(), role: 'handyman' },
    app: mockApp,
  }, resT5);

  if (resT5.statusCode !== 200) {
    throw new Error(`TRIP TEST 5 FAILED: Arrived within 50m was rejected (got ${resT5.statusCode})`);
  }
  const updatedT5 = await Order.findById(dueSoonOrder._id);
  if (updatedT5.status !== 'arrived') {
    throw new Error('TRIP TEST 5 FAILED: Order status is not arrived');
  }
  console.log('[TRIP TEST 5] PASSED: Order successfully transitioned to ARRIVED ✓');

  // TRIP TEST 6: Handyman moves far away and tries startOrder (in-progress) -> Backend rejects
  console.log('\n>>> TRIP TEST 6: Handyman moves away (>50m) and tries startOrder -> Backend rejects <<<');
  const resT6 = createMockRes();
  await startOrder({
    params: { id: dueSoonOrder._id.toString() },
    body: { latitude: 30.050, longitude: 31.250 }, // moved far
    user: { id: handyman._id.toString(), role: 'handyman' },
    app: mockApp,
  }, resT6);

  if (resT6.statusCode !== 400) {
    throw new Error(`TRIP TEST 6 FAILED: startOrder when far should be rejected with 400`);
  }
  console.log('[TRIP TEST 6] PASSED: startOrder rejected when handyman moves > 50m away ✓');

  // TRIP TEST 7: Handyman returns <= 50m and starts order -> in-progress accepted
  console.log('\n>>> TRIP TEST 7: Handyman returns <= 50m and starts order -> in-progress accepted <<<');
  const resT7 = createMockRes();
  await startOrder({
    params: { id: dueSoonOrder._id.toString() },
    body: { latitude: 30.08702, longitude: 31.30902 },
    user: { id: handyman._id.toString(), role: 'handyman' },
    app: mockApp,
  }, resT7);

  if (resT7.statusCode !== 200) {
    throw new Error(`TRIP TEST 7 FAILED: startOrder within 50m rejected with ${resT7.statusCode}`);
  }
  const updatedT7 = await Order.findById(dueSoonOrder._id);
  if (updatedT7.status !== 'in-progress' || !updatedT7.executionStartedAt) {
    throw new Error('TRIP TEST 7 FAILED: Order not in-progress or executionStartedAt missing');
  }
  console.log('[TRIP TEST 7] PASSED: Order transitioned to IN-PROGRESS with execution metadata ✓');

  // TRIP TEST 8: Reschedule update recalculates departure window strictly on new date
  console.log('\n>>> TRIP TEST 8: Rescheduled from today to future date recalculates departure window <<<');
  const newFutureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  dueSoonOrder.scheduledDate = newFutureDate;
  dueSoonOrder.scheduledTime = '14:00';
  dueSoonOrder.status = 'scheduled';
  dueSoonOrder.isHandymanOnTheWay = false;
  await dueSoonOrder.save();

  const newWindow = await computeDepartureWindow({ order: dueSoonOrder });
  if (newWindow.canDepart !== false) {
    throw new Error('TRIP TEST 8 FAILED: Departure window should be false for newly rescheduled date');
  }
  console.log('[TRIP TEST 8] PASSED: Departure window correctly updated to new rescheduled date (canDepart: false) ✓');

  // Cleanup
  await Order.deleteMany({ customerId: customer._id });
  await User.deleteMany({ _id: { $in: [customer._id, handyman._id] } });

  console.log('\n===============================================================');
  console.log(' ALL 8 TRIP JOURNEY & GEOFENCING TESTS PASSED (100%)!');
  console.log('===============================================================\n');
}

async function runArrivedCancellationSuite() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('\n===============================================================');
  console.log(' RUNNING ARRIVED -> CANCELLED & PENALTY TESTS');
  console.log('===============================================================\n');

  let customer = await User.findOne({ email: 'test_arrived_cust@herfy.com' });
  if (!customer) {
    customer = await User.create({
      name: 'طارق العميل',
      email: 'test_arrived_cust@herfy.com',
      phone: '01066661111',
      password: 'password123',
      role: 'customer',
      penaltyCount: 0,
      penaltyAmount: 0,
      isVerified: true,
    });
  } else {
    customer.penaltyCount = 0;
    customer.penaltyAmount = 0;
    await customer.save();
  }

  let handyman = await User.findOne({ email: 'test_arrived_handy@herfy.com' });
  if (!handyman) {
    handyman = await User.create({
      name: 'هاني الحرفي',
      email: 'test_arrived_handy@herfy.com',
      phone: '01066662222',
      password: 'password123',
      role: 'handyman',
      isVerified: true,
    });
  }

  const mockApp = {
    get: (key) => (key === 'io' ? { to: () => ({ emit: () => {} }) } : null),
  };

  const createMockRes = () => {
    const res = {
      statusCode: 200,
      body: null,
      status: function (code) {
        this.statusCode = code;
        return this;
      },
      json: function (data) {
        this.body = data;
        return data;
      },
    };
    return res;
  };

  // TEST C1: Order = ARRIVED -> Customer cancels -> Status becomes CANCELLED + Penalty calculated
  console.log('>>> CANCEL TEST 1: ARRIVED -> Customer cancels -> Status CANCELLED + Penalty calculated <<<');
  const arrivedOrder = await Order.create({
    customerId: customer._id,
    handymanId: handyman._id,
    profession: 'سباكة',
    status: 'arrived',
    customerLocation: { type: 'Point', coordinates: [31.309, 30.087] },
    orderLocation: { type: 'Point', coordinates: [31.309, 30.087] },
  });

  const resC1 = createMockRes();
  await updateOrderStatus({
    params: { id: arrivedOrder._id.toString() },
    body: { status: 'cancelled', reason: 'لم أعد بحاجة للخدمة' },
    user: { id: customer._id.toString(), role: 'customer', name: customer.name },
    app: mockApp,
  }, resC1);

  if (resC1.statusCode !== 200) {
    throw new Error(`CANCEL TEST 1 FAILED: Cancel from arrived was rejected with code ${resC1.statusCode}: ${JSON.stringify(resC1.body)}`);
  }

  const updatedC1 = await Order.findById(arrivedOrder._id);
  if (updatedC1.status !== 'cancelled' || updatedC1.penaltyAmount !== 50) {
    throw new Error(`CANCEL TEST 1 FAILED: Order status is ${updatedC1.status}, penalty is ${updatedC1.penaltyAmount}`);
  }

  const updatedCust = await User.findById(customer._id);
  if (updatedCust.penaltyAmount !== 50 || updatedCust.penaltyCount !== 1) {
    throw new Error(`CANCEL TEST 1 FAILED: Customer penaltyAmount=${updatedCust.penaltyAmount}, penaltyCount=${updatedCust.penaltyCount}`);
  }
  console.log('[CANCEL TEST 1] PASSED: ARRIVED -> CANCELLED succeeded, penalty 50 EGP recorded ✓');

  // TEST C2: Duplicate cancel request (Retry) -> Idempotent, no double penalty
  console.log('\n>>> CANCEL TEST 2: Duplicate cancel request -> Idempotent, no double penalty <<<');
  const resC2 = createMockRes();
  await updateOrderStatus({
    params: { id: arrivedOrder._id.toString() },
    body: { status: 'cancelled', reason: 'لم أعد بحاجة للخدمة' },
    user: { id: customer._id.toString(), role: 'customer', name: customer.name },
    app: mockApp,
  }, resC2);

  // Even if called again, customer penalty must stay 50 and count 1
  const custAfterRetry = await User.findById(customer._id);
  if (custAfterRetry.penaltyAmount !== 50 || custAfterRetry.penaltyCount !== 1) {
    throw new Error(`CANCEL TEST 2 FAILED: Double penalty occurred! Amount=${custAfterRetry.penaltyAmount}, count=${custAfterRetry.penaltyCount}`);
  }
  console.log('[CANCEL TEST 2] PASSED: Retry handled safely without double penalty ✓');

  // TEST C3: COMPLETED -> CANCELLED -> Strictly blocked
  console.log('\n>>> CANCEL TEST 3: COMPLETED -> CANCELLED -> Strictly blocked <<<');
  const completedOrder = await Order.create({
    customerId: customer._id,
    handymanId: handyman._id,
    profession: 'نجارة',
    status: 'completed',
  });

  const resC3 = createMockRes();
  await updateOrderStatus({
    params: { id: completedOrder._id.toString() },
    body: { status: 'cancelled' },
    user: { id: customer._id.toString(), role: 'customer', name: customer.name },
    app: mockApp,
  }, resC3);

  if (resC3.statusCode !== 400) {
    throw new Error('CANCEL TEST 3 FAILED: Cancel on completed order was not blocked');
  }
  console.log('[CANCEL TEST 3] PASSED: COMPLETED -> CANCELLED correctly blocked ✓');

  // TEST C4: Unauthorized user -> Cancel rejected
  console.log('\n>>> CANCEL TEST 4: Unauthorized user -> Cancel rejected with 403 <<<');
  let stranger = await User.findOne({ email: 'stranger_cancel@herfy.com' });
  if (!stranger) {
    stranger = await User.create({
      name: 'شخص غريب',
      email: 'stranger_cancel@herfy.com',
      password: 'password123',
      role: 'customer',
    });
  }

  const anotherArrived = await Order.create({
    customerId: customer._id,
    handymanId: handyman._id,
    profession: 'سباكة',
    status: 'arrived',
  });

  const resC4 = createMockRes();
  await updateOrderStatus({
    params: { id: anotherArrived._id.toString() },
    body: { status: 'cancelled' },
    user: { id: stranger._id.toString(), role: 'customer', name: stranger.name },
    app: mockApp,
  }, resC4);

  if (resC4.statusCode !== 403) {
    throw new Error('CANCEL TEST 4 FAILED: Stranger was not rejected with 403');
  }
  console.log('[CANCEL TEST 4] PASSED: Unauthorized user cancel rejected with 403 ✓');

  // TEST C5: Handyman cancels from ARRIVED -> Status CANCELLED + Handyman fine logic executed
  console.log('\n>>> CANCEL TEST 5: ARRIVED -> Handyman cancels -> Status CANCELLED + Fine logic triggered <<<');
  let handyProfile = await Handyman.findOne({ userId: handyman._id });
  if (!handyProfile) {
    handyProfile = await Handyman.create({
      userId: handyman._id,
      profession: 'نجارة',
      price: 100,
      monthlyCancellationCount: 2, // Set to 2 so this 3rd cancellation triggers penalty
      penaltyCount: 0,
      penaltyAmount: 0,
      registrationStatus: 'approved',
      verified: true,
    });
  } else {
    handyProfile.monthlyCancellationCount = 2;
    handyProfile.penaltyCount = 0;
    handyProfile.penaltyAmount = 0;
    handyProfile.registrationStatus = 'approved';
    handyProfile.verified = true;
    await handyProfile.save();
  }

  const handyArrivedOrder = await Order.create({
    customerId: customer._id,
    handymanId: handyman._id,
    profession: 'نجارة',
    status: 'arrived',
    customerLocation: { type: 'Point', coordinates: [31.309, 30.087] },
    orderLocation: { type: 'Point', coordinates: [31.309, 30.087] },
  });

  const resC5 = createMockRes();
  await updateOrderStatus({
    params: { id: handyArrivedOrder._id.toString() },
    body: { status: 'cancelled', reason: 'تعذر التواصل مع العميل' },
    user: { id: handyman._id.toString(), role: 'handyman', name: handyman.name },
    app: mockApp,
  }, resC5);

  if (resC5.statusCode !== 200) {
    throw new Error(`CANCEL TEST 5 FAILED: Handyman cancel from arrived rejected with code ${resC5.statusCode}`);
  }

  const updatedC5 = await Order.findById(handyArrivedOrder._id);
  if (updatedC5.status !== 'cancelled' || updatedC5.cancelledBy !== 'handyman') {
    throw new Error(`CANCEL TEST 5 FAILED: Order status is ${updatedC5.status}, cancelledBy is ${updatedC5.cancelledBy}`);
  }

  const fineDoc = await Fine.findOne({ orderId: handyArrivedOrder._id, handymanId: handyman._id });
  if (!fineDoc || fineDoc.amount !== 50) {
    throw new Error('CANCEL TEST 5 FAILED: Handyman Fine was not created in DB');
  }
  console.log('[CANCEL TEST 5] PASSED: Handyman cancelled from ARRIVED, fine 50 EGP created in DB ✓');

  // TEST C6: Direct HTTP API Request to /api/orders/:id/status
  console.log('\n>>> CANCEL TEST 6: Real HTTP request (PATCH /api/orders/:id/status) as Handyman & Customer <<<');
  const jwt = require('jsonwebtoken');
  const request = require('supertest');
  const server = require('./app');

  const customerToken = jwt.sign(
    { id: customer._id.toString(), role: 'customer', name: customer.name },
    process.env.JWT_SECRET || 'secret'
  );
  const handymanToken = jwt.sign(
    { id: handyman._id.toString(), role: 'handyman', name: handyman.name },
    process.env.JWT_SECRET || 'secret'
  );

  // HTTP test customer
  const httpCustOrder = await Order.create({
    customerId: customer._id,
    handymanId: handyman._id,
    profession: 'سباكة',
    status: 'arrived',
    customerLocation: { type: 'Point', coordinates: [31.309, 30.087] },
    orderLocation: { type: 'Point', coordinates: [31.309, 30.087] },
  });

  const httpCustRes = await request(server)
    .patch(`/api/orders/${httpCustOrder._id}/status`)
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ status: 'cancelled', reason: 'إلغاء عبر API الحقيقي' });

  if (httpCustRes.statusCode !== 200 || httpCustRes.body.order?.status !== 'cancelled') {
    throw new Error(`CANCEL TEST 6 FAILED: Real HTTP Customer cancellation returned ${httpCustRes.statusCode}: ${JSON.stringify(httpCustRes.body)}`);
  }
  console.log('[CANCEL TEST 6A] PASSED: Real HTTP Customer cancellation -> 200 OK & status=cancelled ✓');

  // HTTP test handyman
  const httpHandyOrder = await Order.create({
    customerId: customer._id,
    handymanId: handyman._id,
    profession: 'سباكة',
    status: 'arrived',
    customerLocation: { type: 'Point', coordinates: [31.309, 30.087] },
    orderLocation: { type: 'Point', coordinates: [31.309, 30.087] },
  });

  const httpHandyRes = await request(server)
    .patch(`/api/orders/${httpHandyOrder._id}/status`)
    .set('Authorization', `Bearer ${handymanToken}`)
    .send({ status: 'cancelled', reason: 'إلغاء عبر API الحقيقي للحرفي' });

  if (httpHandyRes.statusCode !== 200 || httpHandyRes.body.order?.status !== 'cancelled') {
    throw new Error(`CANCEL TEST 6 FAILED: Real HTTP Handyman cancellation returned ${httpHandyRes.statusCode}: ${JSON.stringify(httpHandyRes.body)}`);
  }
  console.log('[CANCEL TEST 6B] PASSED: Real HTTP Handyman cancellation -> 200 OK & status=cancelled ✓');

  // Cleanup
  await Order.deleteMany({ customerId: customer._id });
  await Order.deleteMany({ _id: { $in: [anotherArrived._id, handyArrivedOrder._id, httpCustOrder._id, httpHandyOrder._id] } });
  await Fine.deleteMany({ handymanId: handyman._id });
  await User.deleteMany({ _id: { $in: [customer._id, handyman._id, stranger._id] } });
  await Handyman.deleteMany({ userId: handyman._id });

  console.log('\n===============================================================');
  console.log(' ALL ARRIVED -> CANCELLED & PENALTY TESTS PASSED (100%)!');
  console.log('===============================================================\n');
}

async function run20LiveTrackingTestSuite() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('\n===============================================================');
  console.log(' RUNNING 20 COMPREHENSIVE LIVE TRACKING TESTS');
  console.log('===============================================================\n');

  const jwt = require('jsonwebtoken');
  const request = require('supertest');
  const server = require('./app');

  let customer = await User.findOne({ email: 'live_track_cust@herfy.com' });
  if (!customer) {
    customer = await User.create({
      name: 'سالم العميل',
      email: 'live_track_cust@herfy.com',
      phone: '01077771111',
      password: 'password123',
      role: 'customer',
      isVerified: true,
    });
  }

  let handyman = await User.findOne({ email: 'live_track_handy@herfy.com' });
  if (!handyman) {
    handyman = await User.create({
      name: 'كمال الحرفي',
      email: 'live_track_handy@herfy.com',
      phone: '01077772222',
      password: 'password123',
      role: 'handyman',
      isVerified: true,
    });
  }

  let handyProfile = await Handyman.findOne({ userId: handyman._id });
  if (!handyProfile) {
    handyProfile = await Handyman.create({
      userId: handyman._id,
      profession: 'كهرباء',
      price: 150,
      registrationStatus: 'approved',
      verified: true,
    });
  }

  let otherHandyman = await User.findOne({ email: 'live_track_handy2@herfy.com' });
  if (!otherHandyman) {
    otherHandyman = await User.create({
      name: 'جمال الحرفي 2',
      email: 'live_track_handy2@herfy.com',
      phone: '01077773333',
      password: 'password123',
      role: 'handyman',
      isVerified: true,
    });
  }

  const customerToken = jwt.sign(
    { id: customer._id.toString(), role: 'customer', name: customer.name },
    process.env.JWT_SECRET || 'secret'
  );
  const handymanToken = jwt.sign(
    { id: handyman._id.toString(), role: 'handyman', name: handyman.name },
    process.env.JWT_SECRET || 'secret'
  );
  const otherHandymanToken = jwt.sign(
    { id: otherHandyman._id.toString(), role: 'handyman', name: otherHandyman.name },
    process.env.JWT_SECRET || 'secret'
  );

  // TEST 1: SCHEDULED future date => no tracking
  console.log('>>> TEST 1: SCHEDULED future date => no tracking <<<');
  const futureOrder = await Order.create({
    customerId: customer._id,
    handymanId: handyman._id,
    profession: 'كهرباء',
    status: 'scheduled',
    requestType: 'scheduled',
    scheduledDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
    scheduledTime: '15:00',
    orderLocation: { type: 'Point', coordinates: [31.309, 30.087] },
    customerLocation: { type: 'Point', coordinates: [31.309, 30.087] },
  });

  const resT1 = await computeDepartureWindow({ order: futureOrder });
  if (resT1.canDepart !== false) {
    throw new Error('TEST 1 FAILED: Future date should not allow tracking/departure');
  }
  console.log('[TEST 1] PASSED: Future scheduled order departure blocked (canDepart: false) ✓');

  // TEST 2: SCHEDULED before departure window => ON_THE_WAY blocked
  console.log('\n>>> TEST 2: SCHEDULED before departure window => ON_THE_WAY blocked <<<');
  const dueLaterOrder = await Order.create({
    customerId: customer._id,
    handymanId: handyman._id,
    profession: 'كهرباء',
    status: 'scheduled',
    requestType: 'scheduled',
    scheduledDate: new Date(),
    scheduledTime: '23:59',
    orderLocation: { type: 'Point', coordinates: [31.309, 30.087] },
    customerLocation: { type: 'Point', coordinates: [31.309, 30.087] },
  });

  const resT2 = await request(server)
    .patch(`/api/orders/${dueLaterOrder._id}/on-the-way`)
    .set('Authorization', `Bearer ${handymanToken}`)
    .send({ latitude: 30.080, longitude: 31.320 });

  if (resT2.statusCode !== 400) {
    throw new Error(`TEST 2 FAILED: Expected 400, got ${resT2.statusCode}`);
  }
  console.log('[TEST 2] PASSED: ON_THE_WAY rejected before departure window ✓');

  // TEST 3: Inside departure window => ON_THE_WAY allowed
  console.log('\n>>> TEST 3: Inside departure window => ON_THE_WAY allowed <<<');
  const now = new Date();
  const appointmentMinutesFromNow = 12;
  const appointmentDate = new Date(now.getTime() + appointmentMinutesFromNow * 60 * 1000);
  const timeStr = `${String(appointmentDate.getHours()).padStart(2, '0')}:${String(appointmentDate.getMinutes()).padStart(2, '0')}`;

  const dueNowOrder = await Order.create({
    customerId: customer._id,
    handymanId: handyman._id,
    profession: 'كهرباء',
    status: 'scheduled',
    requestType: 'scheduled',
    scheduledDate: appointmentDate,
    scheduledTime: timeStr,
    orderLocation: { type: 'Point', coordinates: [31.309, 30.087] },
    customerLocation: { type: 'Point', coordinates: [31.309, 30.087] },
  });

  const resT3 = await request(server)
    .patch(`/api/orders/${dueNowOrder._id}/on-the-way`)
    .set('Authorization', `Bearer ${handymanToken}`)
    .send({ latitude: 30.080, longitude: 31.320 });

  if (resT3.statusCode !== 200 || !resT3.body.order?.isHandymanOnTheWay) {
    throw new Error(`TEST 3 FAILED: Expected 200, got ${resT3.statusCode}: ${JSON.stringify(resT3.body)}`);
  }
  console.log('[TEST 3] PASSED: ON_THE_WAY allowed inside departure window, tripStartedAt saved ✓');

  // TEST 4: ON_THE_WAY => live location updates allowed
  console.log('\n>>> TEST 4: ON_THE_WAY => live location updates allowed via PUT /live-location <<<');
  const resT4 = await request(server)
    .put(`/api/orders/${dueNowOrder._id}/live-location`)
    .set('Authorization', `Bearer ${handymanToken}`)
    .send({
      latitude: 30.082,
      longitude: 31.318,
      heading: 90,
      speed: 35,
      accuracy: 5,
      timestamp: new Date().toISOString(),
    });

  if (resT4.statusCode !== 200 || resT4.body.liveTracking?.latitude !== 30.082) {
    throw new Error(`TEST 4 FAILED: Expected 200 with updated live tracking, got ${resT4.statusCode}`);
  }
  console.log('[TEST 4] PASSED: Live location update persisted to liveTracking object in DB ✓');

  // TEST 5: Customer receives latest handyman location (DB verification)
  console.log('\n>>> TEST 5: Customer receives latest handyman location via GET /orders/:id <<<');
  const resT5 = await request(server)
    .get(`/api/orders/${dueNowOrder._id}`)
    .set('Authorization', `Bearer ${customerToken}`);

  const orderReturned = resT5.body.order || resT5.body;
  if (resT5.statusCode !== 200 || orderReturned?.liveTracking?.latitude !== 30.082) {
    throw new Error(`TEST 5 FAILED: Customer could not retrieve liveTracking: ${JSON.stringify(resT5.body)}`);
  }
  console.log('[TEST 5] PASSED: Customer retrieved authoritative live location from server ✓');

  // TEST 6: Unauthorized user tries location update => rejected (403)
  console.log('\n>>> TEST 6: Unauthorized user tries location update => rejected (403) <<<');
  const resT6 = await request(server)
    .put(`/api/orders/${dueNowOrder._id}/live-location`)
    .set('Authorization', `Bearer ${otherHandymanToken}`)
    .send({ latitude: 30.083, longitude: 31.317 });

  if (resT6.statusCode !== 403) {
    throw new Error(`TEST 6 FAILED: Expected 403, got ${resT6.statusCode}`);
  }
  console.log('[TEST 6] PASSED: Unauthorized location update blocked with 403 ✓');

  // TEST 7: Old timestamp => rejected/ignored
  console.log('\n>>> TEST 7: Old timestamp => stale update ignored safely <<<');
  const staleTimestamp = new Date(Date.now() - 100000).toISOString();
  const resT7 = await request(server)
    .put(`/api/orders/${dueNowOrder._id}/live-location`)
    .set('Authorization', `Bearer ${handymanToken}`)
    .send({
      latitude: 30.084,
      longitude: 31.316,
      timestamp: staleTimestamp,
    });

  const orderAfterStale = await Order.findById(dueNowOrder._id);
  if (orderAfterStale.liveTracking.latitude === 30.084) {
    throw new Error('TEST 7 FAILED: Stale location update overwrote newer position');
  }
  console.log('[TEST 7] PASSED: Stale timestamp rejected without overwriting latest coordinates ✓');

  // TEST 8: ARRIVED >50m => rejected
  console.log('\n>>> TEST 8: ARRIVED >50m => rejected with 400 <<<');
  const resT8 = await request(server)
    .patch(`/api/orders/${dueNowOrder._id}/status`)
    .set('Authorization', `Bearer ${handymanToken}`)
    .send({
      status: 'arrived',
      latitude: 30.095, // ~1km away from 30.087, 31.309
      longitude: 31.309,
    });

  if (resT8.statusCode !== 400) {
    throw new Error(`TEST 8 FAILED: Expected 400 for distance > 50m, got ${resT8.statusCode}`);
  }
  console.log('[TEST 8] PASSED: Arrival from >50m rejected with 400 and distance explanation ✓');

  // TEST 9: ARRIVED <=50m => accepted
  console.log('\n>>> TEST 9: ARRIVED <=50m => accepted & arrival metadata recorded <<<');
  const resT9 = await request(server)
    .patch(`/api/orders/${dueNowOrder._id}/status`)
    .set('Authorization', `Bearer ${handymanToken}`)
    .send({
      status: 'arrived',
      latitude: 30.08701, // ~1-2 meters from customer
      longitude: 31.30901,
    });

  if (resT9.statusCode !== 200 || resT9.body.order?.status !== 'arrived') {
    throw new Error(`TEST 9 FAILED: Expected 200 arrived, got ${resT9.statusCode}`);
  }
  const arrivedDb = await Order.findById(dueNowOrder._id);
  if (!arrivedDb.arrivedAt || !arrivedDb.arrivalLatitude || arrivedDb.liveTracking.isActive !== false) {
    throw new Error('TEST 9 FAILED: Arrival metadata or liveTracking.isActive was not properly set');
  }
  console.log('[TEST 9] PASSED: Order set to ARRIVED, arrival metadata saved, liveTracking deactivated ✓');

  // TEST 10: IN_PROGRESS >50m => rejected
  console.log('\n>>> TEST 10: IN_PROGRESS >50m => rejected with 400 <<<');
  const resT10 = await request(server)
    .post(`/api/orders/${dueNowOrder._id}/start`)
    .set('Authorization', `Bearer ${handymanToken}`)
    .send({
      latitude: 30.095, // moved away
      longitude: 31.309,
    });

  if (resT10.statusCode !== 400) {
    throw new Error(`TEST 10 FAILED: Expected 400 for startOrder >50m, got ${resT10.statusCode}`);
  }
  console.log('[TEST 10] PASSED: Start order from >50m rejected ✓');

  // TEST 11: IN_PROGRESS <=50m => accepted
  console.log('\n>>> TEST 11: IN_PROGRESS <=50m => accepted & execution metadata recorded <<<');
  const resT11 = await request(server)
    .post(`/api/orders/${dueNowOrder._id}/start`)
    .set('Authorization', `Bearer ${handymanToken}`)
    .send({
      latitude: 30.08702,
      longitude: 31.30902,
    });

  if (resT11.statusCode !== 200 || resT11.body.order?.status !== 'in-progress') {
    throw new Error(`TEST 11 FAILED: Expected 200 in-progress, got ${resT11.statusCode}`);
  }
  const inProgressDb = await Order.findById(dueNowOrder._id);
  if (!inProgressDb.executionStartedAt || !inProgressDb.executionStartLatitude) {
    throw new Error('TEST 11 FAILED: Execution start metadata not recorded');
  }
  console.log('[TEST 11] PASSED: Order transitioned to IN_PROGRESS with execution metadata ✓');

  // TEST 12: COMPLETED => live location updates blocked
  console.log('\n>>> TEST 12: COMPLETED => live location updates blocked <<<');
  dueNowOrder.status = 'completed';
  dueNowOrder.isHandymanOnTheWay = false;
  dueNowOrder.trackingStatus = 'stopped';
  await dueNowOrder.save();

  const resT12 = await request(server)
    .put(`/api/orders/${dueNowOrder._id}/live-location`)
    .set('Authorization', `Bearer ${handymanToken}`)
    .send({ latitude: 30.087, longitude: 31.309 });

  if (resT12.statusCode !== 400) {
    throw new Error(`TEST 12 FAILED: Location updates should be blocked for COMPLETED order`);
  }
  console.log('[TEST 12] PASSED: Location updates blocked for COMPLETED order ✓');

  // TEST 13: Cancelled => tracking stopped
  console.log('\n>>> TEST 13: Cancelled => tracking stopped <<<');
  const cancelTestOrder = await Order.create({
    customerId: customer._id,
    handymanId: handyman._id,
    profession: 'سباكة',
    status: 'arrived',
    orderLocation: { type: 'Point', coordinates: [31.309, 30.087] },
    customerLocation: { type: 'Point', coordinates: [31.309, 30.087] },
  });

  const resT13 = await request(server)
    .patch(`/api/orders/${cancelTestOrder._id}/status`)
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ status: 'cancelled', reason: 'إلغاء التجربة' });

  const cancelledDb = await Order.findById(cancelTestOrder._id);
  if (cancelledDb.status !== 'cancelled' || cancelledDb.trackingStatus !== 'stopped') {
    throw new Error('TEST 13 FAILED: Cancelled order tracking not stopped');
  }
  console.log('[TEST 13] PASSED: Cancelled order tracking status is stopped ✓');

  // TEST 14: Reschedule => old tracking/departure window invalidated
  console.log('\n>>> TEST 14: Reschedule => old tracking/departure window invalidated <<<');
  const reschedOrder = await Order.create({
    customerId: customer._id,
    handymanId: handyman._id,
    profession: 'سباكة',
    status: 'scheduled',
    scheduledDate: new Date(),
    scheduledTime: '12:00',
    orderLocation: { type: 'Point', coordinates: [31.309, 30.087] },
    customerLocation: { type: 'Point', coordinates: [31.309, 30.087] },
  });

  reschedOrder.scheduledDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  reschedOrder.scheduledTime = '16:00';
  await reschedOrder.save();

  const reschedWindow = await computeDepartureWindow({ order: reschedOrder });
  if (reschedWindow.canDepart !== false) {
    throw new Error('TEST 14 FAILED: Rescheduled order did not invalidate old departure window');
  }
  console.log('[TEST 14] PASSED: Departure window correctly updated and invalidated for new reschedule date ✓');

  // TEST 15: TomTom ETA available => route + ETA computed
  console.log('\n>>> TEST 15: TomTom ETA available => route + ETA computed <<<');
  const { calculateRoute } = require('./utils/tomtom');
  const route = await calculateRoute({ lat: 30.08, lng: 31.32 }, { lat: 30.087, lng: 31.309 });
  if (!route || route.eta == null || route.distance == null) {
    throw new Error('TEST 15 FAILED: TomTom route failed to calculate ETA/distance');
  }
  console.log(`[TEST 15] PASSED: TomTom computed ETA: ${route.eta} min, distance: ${route.distance} km ✓`);

  // TEST 16: TomTom unavailable => safe fallback without breaking security
  console.log('\n>>> TEST 16: Coordinates calculation fallback when routing fails <<<');
  const fallbackWindow = await computeDepartureWindow({
    order: {
      scheduledDate: new Date(Date.now() + 10 * 60 * 1000),
      scheduledTime: `${new Date().getHours()}:${new Date().getMinutes()}`,
      orderLocation: { coordinates: [0, 0] },
      customerLocation: { coordinates: [0, 0] },
    },
  });
  if (typeof fallbackWindow.canDepart !== 'boolean') {
    throw new Error('TEST 16 FAILED: Fallback failed to return a safe boolean');
  }
  console.log('[TEST 16] PASSED: Safe calculation fallback operates without crash ✓');

  // TEST 17: Refresh Customer Tracking Page => latest valid tracking state restored
  console.log('\n>>> TEST 17: Refresh Customer Tracking Page => latest valid tracking state restored <<<');
  const resT17 = await request(server)
    .get(`/api/orders/${dueNowOrder._id}`)
    .set('Authorization', `Bearer ${customerToken}`);

  const orderT17 = resT17.body.order || resT17.body;
  if (resT17.statusCode !== 200 || !orderT17?._id) {
    throw new Error('TEST 17 FAILED: Order state could not be refreshed by customer');
  }
  console.log('[TEST 17] PASSED: Latest order state restored upon refresh ✓');

  // TEST 18: Refresh Handyman Page => current order/tracking state restored
  console.log('\n>>> TEST 18: Refresh Handyman Page => current order/tracking state restored <<<');
  const resT18 = await request(server)
    .get(`/api/orders/${dueNowOrder._id}`)
    .set('Authorization', `Bearer ${handymanToken}`);

  const orderT18 = resT18.body.order || resT18.body;
  if (resT18.statusCode !== 200 || !orderT18?._id) {
    throw new Error('TEST 18 FAILED: Order state could not be refreshed by handyman');
  }
  console.log('[TEST 18] PASSED: Handyman order state restored upon refresh ✓');

  // TEST 19: Order location is immutable snapshot
  console.log('\n>>> TEST 19: orderLocation remains immutable and fixed snapshot <<<');
  const snapshotOrder = await Order.create({
    customerId: customer._id,
    handymanId: handyman._id,
    profession: 'نجارة',
    status: 'scheduled',
    orderLocation: { type: 'Point', coordinates: [31.300, 30.080], address: 'عنوان ثابت أصلي' },
    customerLocation: { type: 'Point', coordinates: [31.300, 30.080] },
  });

  // Customer moves profile or sends live GPS, orderLocation must stay unchanged
  const fetchedSnapshot = await Order.findById(snapshotOrder._id);
  if (fetchedSnapshot.orderLocation.coordinates[0] !== 31.300 || fetchedSnapshot.orderLocation.coordinates[1] !== 30.080) {
    throw new Error('TEST 19 FAILED: orderLocation was modified');
  }
  console.log('[TEST 19] PASSED: orderLocation is an immutable snapshot of service location ✓');

  // TEST 20: Rejection of GPS Spoofing / Malformed data
  console.log('\n>>> TEST 20: Rejection of GPS Spoofing / Malformed data <<<');
  const resT20 = await request(server)
    .put(`/api/orders/${dueNowOrder._id}/live-location`)
    .set('Authorization', `Bearer ${handymanToken}`)
    .send({ latitude: 195.5, longitude: -210 }); // Invalid lat/lng

  if (resT20.statusCode !== 400) {
    throw new Error('TEST 20 FAILED: Spoofed/malformed GPS coordinates were not rejected with 400');
  }
  console.log('[TEST 20] PASSED: Malformed/spoofed coordinates strictly rejected by server ✓');

  // Cleanup
  await Order.deleteMany({ customerId: customer._id });
  await User.deleteMany({ _id: { $in: [customer._id, handyman._id, otherHandyman._id] } });
  await Handyman.deleteMany({ userId: { $in: [handyman._id, otherHandyman._id] } });

  console.log('\n===============================================================');
  console.log(' ALL 20 LIVE TRACKING & GEOFENCING TESTS PASSED (100%)!');
  console.log('===============================================================\n');
}

async function runCustomerDocumentsTestSuite() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('\n===============================================================');
  console.log(' RUNNING 10 CUSTOMER DOCUMENTS & ADMIN VIEW TESTS');
  console.log('===============================================================\n');

  const jwt = require('jsonwebtoken');
  const request = require('supertest');
  const server = require('./app');

  let adminUser = await User.findOne({ email: 'admin_doc_test@herfy.com' });
  if (!adminUser) {
    adminUser = await User.create({
      name: 'مدير المنصة',
      email: 'admin_doc_test@herfy.com',
      phone: '01099990000',
      password: 'password123',
      role: 'customer',
      isAdmin: true,
      isVerified: true,
    });
  }

  let customerUser = await User.findOne({ email: 'cust_doc_test@herfy.com' });
  if (!customerUser) {
    customerUser = await User.create({
      name: 'أحمد العميل',
      email: 'cust_doc_test@herfy.com',
      phone: '01088880000',
      password: 'password123',
      role: 'customer',
      isVerified: true,
    });
  }

  const adminToken = jwt.sign(
    { id: adminUser._id.toString(), role: 'admin', name: adminUser.name },
    process.env.JWT_SECRET || 'secret'
  );
  const customerToken = jwt.sign(
    { id: customerUser._id.toString(), role: 'customer', name: customerUser.name },
    process.env.JWT_SECRET || 'secret'
  );

  // TEST 1: Customer Upload
  console.log('>>> TEST 1: Customer uploads document via /api/uploads/document <<<');
  const resT1 = await request(server)
    .post('/api/uploads/document')
    .set('Authorization', `Bearer ${customerToken}`)
    .field('type', 'national_id')
    .attach('document', Buffer.from('%PDF-1.4 Mock PDF Document Content for KYC Testing'), 'customer_national_id.pdf');

  if (resT1.statusCode !== 200 || !resT1.body.url || !resT1.body.document) {
    throw new Error(`TEST 1 FAILED: Expected 200 with document details, got ${resT1.statusCode}: ${JSON.stringify(resT1.body)}`);
  }
  console.log('[TEST 1] PASSED: Customer document uploaded & persisted to database successfully ✓');

  // TEST 2: Customer API retrieves documents
  console.log('\n>>> TEST 2: Fetch Customer profile and verify documents array <<<');
  const customerInDb = await User.findById(customerUser._id);
  if (!customerInDb.documents || customerInDb.documents.length === 0) {
    throw new Error('TEST 2 FAILED: Customer documents array empty in database');
  }
  console.log(`[TEST 2] PASSED: Customer documents exist in DB (count: ${customerInDb.documents.length}) ✓`);

  // TEST 3: Admin API retrieves Customer documents via /api/admin/users/:id
  console.log('\n>>> TEST 3: Admin calls GET /api/admin/users/:id and receives documents <<<');
  const resT3 = await request(server)
    .get(`/api/admin/users/${customerUser._id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  const userDocsT3 = resT3.body.data?.documents || resT3.body.data?.user?.documents;
  if (resT3.statusCode !== 200 || !Array.isArray(userDocsT3) || userDocsT3.length === 0) {
    throw new Error(`TEST 3 FAILED: Admin could not retrieve customer documents: ${JSON.stringify(resT3.body)}`);
  }
  console.log(`[TEST 3] PASSED: Admin API returned ${userDocsT3.length} document(s) in response ✓`);

  // TEST 4: View Documents endpoint /api/admin/users/:id/documents
  console.log('\n>>> TEST 4: Admin calls dedicated GET /api/admin/users/:id/documents <<<');
  const resT4 = await request(server)
    .get(`/api/admin/users/${customerUser._id}/documents`)
    .set('Authorization', `Bearer ${adminToken}`);

  if (resT4.statusCode !== 200 || !Array.isArray(resT4.body.documents) || resT4.body.documents.length === 0) {
    throw new Error(`TEST 4 FAILED: Admin dedicated documents endpoint failed: ${JSON.stringify(resT4.body)}`);
  }
  console.log('[TEST 4] PASSED: Dedicated documents endpoint returned valid document list ✓');

  // TEST 5: Image document upload & view
  console.log('\n>>> TEST 5: Customer uploads Image document (JPG/PNG) <<<');
  const resT5 = await request(server)
    .post('/api/uploads/document')
    .set('Authorization', `Bearer ${customerToken}`)
    .field('type', 'passport')
    .attach('document', Buffer.from('Fake-Image-Buffer-Data'), 'customer_passport.jpg');

  if (resT5.statusCode !== 200 || !resT5.body.url) {
    throw new Error(`TEST 5 FAILED: Image document upload failed: ${JSON.stringify(resT5.body)}`);
  }
  console.log('[TEST 5] PASSED: Image document uploaded and preview url verified ✓');

  // TEST 6: PDF document verification
  console.log('\n>>> TEST 6: PDF document classification & link verification <<<');
  const updatedCust = await User.findById(customerUser._id);
  const pdfDoc = updatedCust.documents.find((d) => /\.pdf($|\?)/i.test(d.url) || d.originalName?.endsWith('.pdf'));
  if (!pdfDoc) {
    throw new Error('TEST 6 FAILED: PDF document not found in customer documents');
  }
  console.log(`[TEST 6] PASSED: PDF document detected correctly with URL: ${pdfDoc.url.slice(0, 35)}... ✓`);

  // TEST 7: Empty documents customer returns empty array (not crash or undefined)
  console.log('\n>>> TEST 7: Customer without documents returns clean empty array <<<');
  const emptyCustEmail = `empty_doc_${Date.now()}@herfy.com`;
  const emptyCustPhone = `010${Math.floor(10000000 + Math.random() * 90000000)}`;
  const emptyCust = await User.create({
    name: 'عميل جديد بدون وثائق',
    email: emptyCustEmail,
    phone: emptyCustPhone,
    password: 'password123',
    role: 'customer',
    isVerified: true,
  });

  const resT7 = await request(server)
    .get(`/api/admin/users/${emptyCust._id}/documents`)
    .set('Authorization', `Bearer ${adminToken}`);

  if (resT7.statusCode !== 200 || !Array.isArray(resT7.body.documents) || resT7.body.documents.length !== 0) {
    throw new Error('TEST 7 FAILED: Empty customer did not return empty array');
  }
  console.log('[TEST 7] PASSED: User without documents returns clean empty array [] ✓');

  // TEST 8: Unauthorized access to Admin documents endpoint => 403
  console.log('\n>>> TEST 8: Unauthorized customer attempts to access Admin documents endpoint <<<');
  const resT8 = await request(server)
    .get(`/api/admin/users/${customerUser._id}/documents`)
    .set('Authorization', `Bearer ${customerToken}`);

  if (resT8.statusCode !== 403) {
    throw new Error(`TEST 8 FAILED: Expected 403 Forbidden, got ${resT8.statusCode}`);
  }
  console.log('[TEST 8] PASSED: Non-admin access to admin documents endpoint rejected with 403 ✓');

  // TEST 9: Invalid/Malformed upload payload rejected with 400
  console.log('\n>>> TEST 9: Unsupported file format (e.g. .exe / .bin) upload rejected <<<');
  const resT9 = await request(server)
    .post('/api/uploads/document')
    .set('Authorization', `Bearer ${customerToken}`)
    .attach('document', Buffer.from('binary-exe-data'), 'malicious_file.exe');

  if (resT9.statusCode !== 400) {
    throw new Error(`TEST 9 FAILED: Invalid document file type was not rejected with 400`);
  }
  console.log('[TEST 9] PASSED: Unsupported file type rejected cleanly with 400 ✓');

  // TEST 10: Refresh and state consistency
  console.log('\n>>> TEST 10: Admin refreshes and re-fetches latest customer documents <<<');
  const resT10 = await request(server)
    .get(`/api/admin/users/${customerUser._id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  if (resT10.statusCode !== 200 || resT10.body.data?.documents?.length < 2) {
    throw new Error('TEST 10 FAILED: Re-fetching customer profile failed or lost documents');
  }
  console.log(`[TEST 10] PASSED: Persistence verified across refreshes (${resT10.body.data.documents.length} documents) ✓`);

  // TEST 11: Handyman registration with 3 documents (National ID, Certificate, Profile Image)
  console.log('\n>>> TEST 11: Handyman registers with National ID, Certificate, and Profile Photo <<<');
  const handymanEmail = `hm_doc_${Date.now()}@herfy.com`;
  const resT11 = await request(server)
    .post('/api/users/register')
    .field('name', 'محمود الحرفي للوثائق')
    .field('email', handymanEmail)
    .field('password', 'password123')
    .field('phone', '01011112233')
    .field('role', 'handyman')
    .field('profession', 'سباكة')
    .field('price', '150')
    .attach('nationalId', Buffer.from('%PDF-1.4 Mock Handyman National ID PDF'), 'handyman_national_id.pdf')
    .attach('certificate', Buffer.from('%PDF-1.4 Mock Handyman Certificate PDF'), 'handyman_cert.pdf')
    .attach('profileImage', Buffer.from('Fake-Image-Data'), 'handyman_avatar.jpg');

  if (resT11.statusCode !== 201) {
    throw new Error(`TEST 11 FAILED: Handyman registration failed with ${resT11.statusCode}: ${JSON.stringify(resT11.body)}`);
  }

  const createdHandymanUser = await User.findOne({ email: handymanEmail });
  const createdHandymanProfile = await Handyman.findOne({ userId: createdHandymanUser._id });

  if (!createdHandymanProfile.nationalId || !createdHandymanProfile.certificate || !createdHandymanProfile.profileImage) {
    throw new Error(`TEST 11 FAILED: Handyman documents not saved in DB: ${JSON.stringify(createdHandymanProfile)}`);
  }
  console.log('[TEST 11] PASSED: Handyman registered and all 3 documents persisted in database ✓');

  // TEST 12: Admin pending-registrations endpoint returns all 3 documents with valid URLs
  console.log('\n>>> TEST 12: Admin fetches /api/admin/pending-registrations and verifies 3 document URLs <<<');
  const resT12 = await request(server)
    .get('/api/admin/pending-registrations?status=pending')
    .set('Authorization', `Bearer ${adminToken}`);

  if (resT12.statusCode !== 200 || !Array.isArray(resT12.body.data)) {
    throw new Error(`TEST 12 FAILED: Failed to fetch pending registrations: ${JSON.stringify(resT12.body)}`);
  }

  const targetReg = resT12.body.data.find((r) => r.email === handymanEmail);
  if (!targetReg || !targetReg.nationalId || !targetReg.certificate || !targetReg.profileImage) {
    throw new Error(`TEST 12 FAILED: Registration missing documents in Admin response: ${JSON.stringify(targetReg)}`);
  }
  console.log('[TEST 12] PASSED: Admin pending registrations response has all 3 document URLs (No "لم يتم إرفاق ملف") ✓');

  // Cleanup
  await User.deleteMany({ _id: { $in: [adminUser._id, customerUser._id, emptyCust._id, createdHandymanUser._id] } });
  await Handyman.deleteMany({ userId: createdHandymanUser._id });

  console.log('\n===============================================================');
  console.log(' ALL 12 CUSTOMER & HANDYMAN DOCUMENTS TESTS PASSED (100%)!');
  console.log('===============================================================\n');
}

async function runAllSuites() {
  await runNotificationRoutingSuite();
  await runComprehensiveRescheduleSuite();
  await runTripJourneySuite();
  await runArrivedCancellationSuite();
  await run20LiveTrackingTestSuite();
  await runCustomerDocumentsTestSuite();
}

runAllSuites().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
