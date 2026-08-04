// jobs/monthlyCancellationReset.js
// Runs at 00:01 on the 1st of every month.
// Resets monthlyCancellationCount and lifts any isSuspendedPendingReview
// suspensions for both customers (User) and handymen (Handyman).

const cron = require('node-cron');
const User = require('../models/User');
const Handyman = require('../models/Handyman');
const { createNotification } = require('../controllers/notificationController');

const startMonthlyCancellationResetJob = (io) => {
  // 00:01 on the 1st of every month
  cron.schedule('1 0 1 * *', async () => {
    const now = new Date();
    console.log(`[MonthlyCancellationReset] Running at ${now.toISOString()}`);

    try {
      // Lift customer suspensions
      const suspendedCustomers = await User.find({ isSuspendedPendingReview: true });
      for (const customer of suspendedCustomers) {
        customer.isSuspendedPendingReview = false;
        customer.suspendedPendingReviewReason = null;
        customer.monthlyCancellationCount = 0;
        customer.monthlyCancellationMonth = now.getMonth();
        customer.monthlyCancellationYear = now.getFullYear();
        await customer.save();
        if (io) {
          await createNotification(
            io, customer._id, 'system_alert',
            '✅ تم رفع التعليق المؤقت',
            'تم رفع التعليق المؤقت عن حسابك تلقائياً مع بداية الشهر الجديد. يمكنك الآن إنشاء طلبات جديدة.',
            {}
          );
        }
      }

      // Lift handyman suspensions
      const suspendedHandymen = await Handyman.find({ isSuspendedPendingReview: true });
      for (const handyman of suspendedHandymen) {
        handyman.isSuspendedPendingReview = false;
        handyman.suspendedPendingReviewReason = null;
        handyman.monthlyCancellationCount = 0;
        handyman.monthlyCancellationMonth = now.getMonth();
        handyman.monthlyCancellationYear = now.getFullYear();
        await handyman.save();
        if (io) {
          await createNotification(
            io, handyman.userId, 'system_alert',
            '✅ تم رفع التعليق المؤقت',
            'تم رفع التعليق المؤقت عن حسابك تلقائياً مع بداية الشهر الجديد. يمكنك الآن قبول طلبات جديدة.',
            {}
          );
        }
      }

      // Reset all monthly counters for everyone (even non-suspended)
      await User.updateMany(
        { monthlyCancellationMonth: { $ne: now.getMonth() } },
        { $set: { monthlyCancellationCount: 0, monthlyCancellationMonth: now.getMonth(), monthlyCancellationYear: now.getFullYear() } }
      );
      await Handyman.updateMany(
        { monthlyCancellationMonth: { $ne: now.getMonth() } },
        { $set: { monthlyCancellationCount: 0, monthlyCancellationMonth: now.getMonth(), monthlyCancellationYear: now.getFullYear() } }
      );

      console.log(`[MonthlyCancellationReset] Done. Lifted ${suspendedCustomers.length} customer + ${suspendedHandymen.length} handyman suspensions.`);
    } catch (err) {
      console.error('[MonthlyCancellationReset] Error:', err.message);
    }
  });

  console.log('Monthly cancellation reset job started (runs 00:01 on 1st of each month)');
};

module.exports = startMonthlyCancellationResetJob;
