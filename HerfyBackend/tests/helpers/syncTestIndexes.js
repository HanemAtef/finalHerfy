const User = require('../../models/User');
const Order = require('../../models/Order');

/** Ensure 2dsphere indexes exist in mongodb-memory-server (geo queries fail without this). */
async function syncTestIndexes() {
  await User.syncIndexes();
  await Order.syncIndexes();
}

module.exports = { syncTestIndexes };
