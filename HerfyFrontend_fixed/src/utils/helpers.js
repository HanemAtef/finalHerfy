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

export const formatDistance = (km) => {
  if (km == null) return '';
  if (km < 1) return `${(km * 1000).toFixed(0)} م`;
  return `${km.toFixed(1)} كم`;
};

export const formatPrice = (price) => `${price} ج.م`;

export const formatDate = (date) =>
  new Date(date).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

export const formatTime = (date) =>
  new Date(date).toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  });

export const ORDER_STATUS_LABELS = {
  pending: 'قيد الانتظار',
  accepted: 'بانتظار تأكيد السعر',
  price_confirmed: 'تم تأكيد السعر',
  'in-progress': 'قيد التنفيذ',
  completed: 'مكتمل',
  cancelled: 'ملغي',
  disputed: 'قيد النزاع',
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
