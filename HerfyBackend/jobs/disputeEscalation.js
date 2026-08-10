// // Runs periodically to flag overdue disputes as escalated and notify admins.
// const cron = require('node-cron');
// const Report = require('../models/Report');
// const User = require('../models/User');
// const { createNotification } = require('../controllers/notificationController');

// const startDisputeEscalationJob = (io) => {
//   // Run every 30 minutes
//   cron.schedule('*/30 * * * *', async () => {
//     try {
//       const overdue = await Report.find({
//         status: { $in: ['pending', 'reviewing'] },
//         slaDeadline: { $lt: new Date() },
//         isEscalated: false,
//       });

//       if (overdue.length === 0) return;

//       const ids = overdue.map(r => r._id);
//       await Report.updateMany({ _id: { $in: ids } }, { isEscalated: true });

//       const admins = await User.find({ isAdmin: true }).select('_id').lean();
//       await Promise.all(
//         admins.map(admin =>
//           createNotification(
//             io,
//             admin._id,
//             'system_alert',
//             'Escalated Disputes',
//             `${overdue.length} dispute(s) have exceeded their SLA deadline and require immediate attention.`,
//             { escalatedCount: overdue.length, reportIds: ids }
//           )
//         )
//       );

//       console.log(`[DisputeCron] Escalated ${overdue.length} overdue dispute(s).`);
//     } catch (err) {
//       console.error('[DisputeCron] Error during escalation check:', err.message);
//     }
//   });
// };

// module.exports = startDisputeEscalationJob;
