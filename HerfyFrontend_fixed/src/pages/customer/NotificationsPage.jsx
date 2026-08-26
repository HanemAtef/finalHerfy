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
  FaCheckDouble,
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
        border: 'border-r-4 border-r-tertiary bg-emerald-50/40',
        icon: <FaCheckCircle className="text-tertiary text-lg" />,
        accent: 'bg-tertiary',
      };
    case 'order_rejected':
    case 'order_cancelled':
    case 'handyman_rejected':
    case 'handyman_suspended':
    case 'account_blocked':
    case 'account_deleted':
      return {
        badge: '🔴 تنبيه / إلغاء',
        border: 'border-r-4 border-r-emergency bg-red-50/40',
        icon: <FaTimesCircle className="text-emergency text-lg" />,
        accent: 'bg-emergency',
      };
    case 'penalty_warning':
    case 'report_filed':
    case 'reschedule_request':
      return {
        badge: '🟡 تحذير / بلاغ',
        border: 'border-r-4 border-r-amber-500 bg-amber-50/40',
        icon: <FaExclamationTriangle className="text-amber-500 text-lg" />,
        accent: 'bg-amber-500',
      };
    case 'order_created':
    case 'emergency_request':
      return {
        badge: '🟣 طلب جديد',
        border: 'border-r-4 border-r-purple-500 bg-purple-50/40',
        icon: <FaClipboardList className="text-purple-500 text-lg" />,
        accent: 'bg-purple-500',
      };
    case 'order_accepted':
    case 'price_confirmed':
    case 'handyman_on_the_way':
    case 'reschedule_response':
      return {
        badge: '🟠 حالة الطلب',
        border: 'border-r-4 border-r-secondary bg-secondary/5',
        icon: <FaTruck className="text-secondary text-lg" />,
        accent: 'bg-secondary',
      };
    case 'new_message':
    case 'system_alert':
    case 'promotion':
    case 'handyman_unsuspended':
    case 'report_resolved':
    default:
      return {
        badge: '🔵 معلومات',
        border: 'border-r-4 border-r-primary bg-primary/5',
        icon: <FaInfoCircle className="text-primary text-lg" />,
        accent: 'bg-primary',
      };
  }
};

export const resolveDestination = (notification, role) => {
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
    // 1. Attempt to mark as read in background without blocking navigation
    if (!n.isRead && n._id) {
      try {
        dispatch(markAsRead(n._id));
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    }

    // 2. Resolve destination and navigate smoothly
    try {
      const destination = resolveDestination(n, role);
      if (destination) {
        navigate(destination);
      }
    } catch (routeErr) {
      console.error('Error resolving notification destination:', routeErr);
      navigate(role === 'handyman' ? '/handyman/dashboard' : '/customer/dashboard');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-borderGray text-primary hover:bg-neutral transition-colors shadow-sm"
            aria-label="رجوع"
          >
            <FaArrowRight size={13} />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-textDark">مركز الإشعارات</h1>
            <p className="text-xs text-textGray mt-0.5">تحديثات الطلبات، الرسائل، وتنبيهات الحساب</p>
          </div>
        </div>

        {notifications?.length > 0 && (
          <button
            type="button"
            onClick={() => dispatch(markAllAsRead())}
            className="inline-flex items-center gap-1.5 rounded-xl border border-borderGray bg-white px-3.5 py-2 text-xs font-bold text-textDark hover:border-primary hover:text-primary transition-all shadow-sm"
          >
            <FaCheckDouble size={13} className="text-tertiary" />
            تحديد الكل كمقروء
          </button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <LoadingSpinner text="جاري تحميل الإشعارات..." />
      ) : !notifications || notifications.length === 0 ? (
        <div className="empty-state py-16 card">
          <div className="empty-state-icon">🔔</div>
          <p className="empty-state-title">لا توجد إشعارات جديدة</p>
          <p className="empty-state-desc">ستظهر هنا جميع التنبيهات الخاصة بطلباتك والمحادثات</p>
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
                className={`card w-full text-right transition-all duration-200 hover:shadow-md ${cat.border} ${
                  !n.isRead ? 'shadow-sm bg-white' : 'opacity-80 bg-white/70'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <div className="mt-0.5 shrink-0">{cat.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${!n.isRead ? 'font-bold text-textDark' : 'font-semibold text-textDark/80'}`}>
                        {n.title}
                      </p>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/90 font-bold border border-borderGray/60 shadow-xs shrink-0">
                        {cat.badge}
                      </span>
                    </div>
                    <p className="text-xs text-textGray mt-1 leading-relaxed">{n.body}</p>
                    {n.type === 'reschedule_request' && n.data?.newDate && (
                      <div className="mt-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-textDark space-y-1">
                        {n.data.senderName && (
                          <p><span className="text-textGray">مرسل الطلب: </span><strong>{n.data.senderName}</strong></p>
                        )}
                        {n.data.oldDate && (
                          <p><span className="text-textGray">الموعد القديم: </span><span>{formatDate(n.data.oldDate)}</span></p>
                        )}
                        <p><span className="text-textGray">الموعد المقترح: </span><strong className="text-primary">{n.data.formattedNewDate || formatDate(n.data.newDate)}</strong></p>
                        {n.data.reason && (
                          <p><span className="text-textGray">السبب: </span><span>{n.data.reason}</span></p>
                        )}
                      </div>
                    )}
                    <p className="text-[11px] text-textGray/80 mt-2">{formatDate(n.createdAt)}</p>
                  </div>
                  {!n.isRead && (
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cat.accent} mt-1.5`} />
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
