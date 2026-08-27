const WALLET_DEBT_SUSPENSION_REASON = "رصيد العمولة المستحقة للمنصة تجاوز الحد المسموح";
const orderConstants = require("./orderConstants");

// ========== Subscription Plans ==========
// Single source of truth for all plan rules.
// Commission rates and client limits must always be read from here —
// never hardcoded in controllers.
const SUBSCRIPTION_PLANS = {
  FREE: {
    price: 0,           // EGP/month
    commissionRate: 10, // %
    maxActiveClients: 1,
  },
  PREMIUM: {
    price: 200,         // EGP/month
    commissionRate: 5,  // %
    maxActiveClients: 3,
  },
};

module.exports = {
  WALLET_DEBT_SUSPENSION_REASON,
  SUBSCRIPTION_PLANS,
  ...orderConstants,
};
