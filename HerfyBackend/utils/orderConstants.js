const ORDER_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  SCHEDULED: 'scheduled',
  PRICE_CONFIRMED: 'scheduled',
  ON_THE_WAY: 'on_the_way',
  ARRIVED: 'arrived',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed',
};

const ORDER_STATUS_LABELS = {
  pending: 'في انتظار قبول الحرفي',
  accepted: 'تم قبول الطلب',
  scheduled: 'تم تحديد الموعد',
  price_confirmed: 'تم تحديد الموعد',
  on_the_way: 'الحرفي في الطريق',
  'on-the-way': 'الحرفي في الطريق',
  arrived: 'الحرفي وصل',
  'in-progress': 'جاري تنفيذ الخدمة',
  in_progress: 'جاري تنفيذ الخدمة',
  completed: 'تم إكمال الخدمة',
  cancelled: 'تم إلغاء الطلب',
  disputed: 'قيد النزاع',
};

const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
};

const GEOFENCE_ALLOWED_RADIUS_METERS = 50;

/**
 * Normalizes any status input to canonical lowercased status string
 */
function normalizeOrderStatus(status) {
  if (!status || typeof status !== 'string') return status;
  const s = status.trim().toLowerCase().replace(/-/g, '_');
  if (s === 'pending') return 'pending';
  if (s === 'accepted') return 'accepted';
  if (s === 'scheduled' || s === 'price_confirmed') return 'scheduled';
  if (s === 'on_the_way' || s === 'ontheway') return 'on_the_way';
  if (s === 'arrived') return 'arrived';
  if (s === 'in_progress' || s === 'inprogress') return 'in-progress';
  if (s === 'completed') return 'completed';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'disputed') return 'disputed';
  return status.toLowerCase();
}

/**
 * Validates allowed state transitions in the workflow
 */
function isAllowedStatusTransition(currentStatusRaw, nextStatusRaw) {
  const current = normalizeOrderStatus(currentStatusRaw);
  const next = normalizeOrderStatus(nextStatusRaw);

  if (current === next) return true;

  const validTransitions = {
    pending: ['accepted', 'cancelled'],
    accepted: ['scheduled', 'cancelled'],
    scheduled: ['on_the_way', 'arrived', 'cancelled'],
    on_the_way: ['arrived', 'cancelled'],
    arrived: ['in-progress', 'cancelled'],
    'in-progress': ['completed', 'disputed'],
    completed: [],
    cancelled: [],
    disputed: ['completed', 'cancelled'],
  };

  const allowed = validTransitions[current] || [];
  return allowed.includes(next);
}

module.exports = {
  ORDER_STATUS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS,
  GEOFENCE_ALLOWED_RADIUS_METERS,
  normalizeOrderStatus,
  isAllowedStatusTransition,
};
