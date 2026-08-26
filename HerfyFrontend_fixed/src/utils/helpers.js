export const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const formatDistance = (val) => {
  if (val == null) return '';
  const num = Number(val);
  if (!Number.isFinite(num)) return '';
  // If value is in meters (> 100), convert to km for thresholding
  const km = num > 100 ? num / 1000 : num;
  if (km < 1) return `${Math.round(km * 1000)} م`;
  return `${km.toFixed(1)} كم`;
};

export const formatPrice = (price) => `${price} ج.م`;

export const formatDate = (date) => {
  if (!date) return 'موعد غير محدد';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'موعد غير محدد';
  return d.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const formatTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDateTime = (date, timeStr) => {
  if (!date) return 'موعد غير محدد';
  const dateFormatted = formatDate(date);
  if (dateFormatted === 'موعد غير محدد') return dateFormatted;
  if (timeStr && typeof timeStr === 'string' && timeStr.trim()) {
    return `${dateFormatted} - ${timeStr.trim()}`;
  }
  const timeFormatted = formatTime(date);
  return timeFormatted ? `${dateFormatted} - ${timeFormatted}` : dateFormatted;
};

import {
  ORDER_STATUS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS,
  GEOFENCE_ALLOWED_RADIUS_METERS,
  normalizeOrderStatus,
} from './orderConstants';

export {
  ORDER_STATUS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS,
  GEOFENCE_ALLOWED_RADIUS_METERS,
  normalizeOrderStatus,
};

export const ROLE_LABELS = {
  customer: 'عميل',
  handyman: 'حرفي',
  admin: 'مدير',
};

// The backend's User model only allows role: "customer" | "handyman" — admin
// status lives in a separate `isAdmin` boolean, it is never a `role` value.
// Anywhere the app needs to branch on role (routing, redirects, labels),
// go through this helper instead of reading `user.role` directly so admins
// are recognized consistently in one place.
export const getEffectiveRole = (user) => {
  if (!user) return null;
  return user.isAdmin ? 'admin' : user.role;
};

export const HANDYMAN_IMAGES = [
  'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400',
  'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=400',
  'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400',
  'https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?w=400',
];

export const getHandymanImage = (index = 0) =>
  HANDYMAN_IMAGES[index % HANDYMAN_IMAGES.length];

export const getDefaultAvatar = (name = 'U') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0F4C75&color=fff&size=128`;
