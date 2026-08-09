import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  FaArrowRight,
  FaBell,
  FaCheckCircle,
  FaExclamationTriangle,
  FaTimesCircle,
  FaInfoCircle,
  FaClipboardList,
  FaTruck,
} from 'react-icons/fa';
import { getNotifications, markAsRead, markAllAsRead } from '../../store/slices/notificationSlice';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { formatDate, getEffectiveRole } from '../../utils/helpers';

// Category configuration for notification colors and icons
const getNotificationCategoryConfig = (type) => {
  switch (type) {
    case 'order_completed':
    case 'handyman_verified':
    case 'payment_confirmed':
      return {
        badge: '🟢 نجاح',
        border: 'border-r-4 border-emerald-500 bg-emerald-50/60',
        icon: <FaCheckCircle className="text-emerald-500 text-lg" />,
        accent: 'bg-emerald-500',
      };
    case 'order_rejected':
    case 'order_cancelled':
    case 'handyman_rejected':
    case 'handyman_suspended':
    case 'account_blocked':
    case 'account_deleted':
      return {
        badge: '🔴 تنبيه / إلغاء',
        border: 'border-r-4 border-red-500 bg-red-50/60',
        icon: <FaTimesCircle className="text-red-500 text-lg" />,
        accent: 'bg-red-500',
      };
    case 'penalty_warning':
    case 'report_filed':
    case 'reschedule_request':
      return {
        badge: '🟡 تحذير / بلاغ',
        border: 'border-r-4 border-amber-500 bg-amber-50/60',
        icon: <FaExclamationTriangle className="text-amber-500 text-lg" />,
        accent: 'bg-amber-500',
      };
    case 'order_created':
    case 'emergency_request':
      return {
        badge: '🟣 طلب جديد',
        border: 'border-r-4 border-purple-500 bg-purple-50/60',
        icon: <FaClipboardList className="text-purple-500 text-lg" />,
        accent: 'bg-purple-500',
      };
    case 'order_accepted':
    case 'price_confirmed':
    case 'handyman_on_the_way':
    case 'reschedule_response':
      return {
        badge: '🟠 حالة الطلب',
        border: 'border-r-4 border-orange-500 bg-orange-50/60',
        icon: <FaTruck className="text-orange-500 text-lg" />,
        accent: 'bg-orange-500',
      };
    case 'new_message':
    case 'system_alert':
    case 'promotion':
    case 'handyman_unsuspended':
    case 'report_resolved':
    default:
      return {
        badge: '🔵 معلومات',
        border: 'border-r-4 border-blue-500 bg-blue-50/60',
        icon: <FaInfoCircle className="text-blue-500 text-lg" />,
        accent: 'bg-blue-500',
      };
  }
};

const resolveDestination = (notification, role) => {
  const orderId = notification.data?.orderId;
  if (!orderId) return null;

  switch (notification.type) {
    case 'new_message':
      return `/chat/${orderId}`;
    case 'order_cancelled':
      return role === 'handyman' ? `/handyman/orders/${orderId}` : `/customer/tracking/${orderId}`;
    case 'order_completed':
      return role === 'handyman' ? `/handyman/orders/${orderId}` : `/customer/review/${orderId}`;
    case 'order_created':
    case 'reschedule_request':
    case 'reschedule_response':
      return role === 'handyman' ? `/handyman/orders/${orderId}` : `/customer/tracking/${orderId}`;
    case 'order_accepted':
    case 'order_rejected':
    case 'price_confirmed':
    case 'handyman_on_the_way':
      return role === 'handyman' ? `/handyman/orders/${orderId}` : `/customer/tracking/${orderId}`;
    default:
      return null;
  }
};

export default function NotificationsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const { notifications, isLoading } = useSelector((state) => state.notifications);
  const role = getEffectiveRole(user);

  useEffect(() => {
    dispatch(getNotifications());
  }, [dispatch]);

  const handleOpen = (n) => {
    if (!n.isRead) dispatch(markAsRead(n._id));
    const destination = resolveDestination(n, role);
    if (destination) navigate(destination);
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-full p-2 text-primary hover:bg-primary/5"
            aria-label="رجوع"
          >
            <FaArrowRight />
          </button>
          <h1 className="text-2xl font-bold text-primary">الإشعارات</h1>
        </div>
        <button
          type="button"
          onClick={() => dispatch(markAllAsRead())}
          className="text-sm font-semibold text-primary hover:underline"
        >
          تحديد الكل كمقروء
        </button>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : !notifications || notifications.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-16 text-center text-textGray">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral">
            <FaBell size={26} className="text-borderGray" />
          </span>
          <p className="font-medium">لا توجد إشعارات حالياً</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => {
            const cat = getNotificationCategoryConfig(n.type);
            return (
              <button
                key={n._id}
                type="button"
                onClick={() => handleOpen(n)}
                className={`card w-full text-right transition hover:shadow-md ${cat.border} ${
                  !n.isRead ? 'shadow-sm font-medium' : 'opacity-85'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1 shrink-0">{cat.icon}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-textDark">{n.title}</p>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-white/80 font-bold border border-gray-200 shadow-2xs">
                        {cat.badge}
                      </span>
                    </div>
                    <p className="text-sm text-textGray mt-1">{n.body}</p>
                    <p className="text-xs text-textGray mt-2">{formatDate(n.createdAt)}</p>
                  </div>
                  {!n.isRead && (
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cat.accent} mt-2`} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
