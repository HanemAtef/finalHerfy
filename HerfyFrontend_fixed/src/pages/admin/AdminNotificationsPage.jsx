import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight, FaBell, FaCheckDouble } from 'react-icons/fa';
import { getNotifications, markAsRead, markAllAsRead } from '../../store/slices/notificationSlice';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { formatDate } from '../../utils/helpers';

const resolveDestination = (notification) => {
  if (!notification) return '/admin/dashboard';
  const data = notification.data || {};
  const reportId = data.reportId || notification.reportId;
  const userId = data.userId || data.handymanId;

  switch (notification.type) {
    case 'report_created':
    case 'dispute_created':
    case 'report_filed':
    case 'report_resolved':
      return '/admin/reports';
    case 'handyman_registered':
    case 'verification_request':
    case 'handyman_verified':
    case 'handyman_rejected':
    case 'registration_approved':
    case 'registration_rejected':
      return '/admin/verifications';
    case 'payment_confirmed':
    case 'penalty.settle':
      return '/admin/wallets';
    case 'account_blocked':
    case 'user.ban':
    case 'user.unban':
      return userId ? `/admin/users/${userId}` : '/admin/users';
    default:
      return '/admin/dashboard';
  }
};

export default function AdminNotificationsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { notifications, isLoading } = useSelector((state) => state.notifications);

  useEffect(() => {
    dispatch(getNotifications());
  }, [dispatch]);

  const handleOpen = (n) => {
    if (!n.isRead && n._id) {
      try {
        dispatch(markAsRead(n._id));
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    }
    const destination = resolveDestination(n);
    if (destination) navigate(destination);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
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
            <h1 className="text-2xl font-extrabold text-textDark">إشعارات الإدارة</h1>
            <p className="text-xs text-textGray mt-0.5">تنبيهات التسجيل الجديد، البلاغات، والنزاعات</p>
          </div>
        </div>

        {notifications?.length > 0 && (
          <button
            type="button"
            onClick={() => dispatch(markAllAsRead())}
            className="inline-flex items-center gap-1.5 rounded-xl border border-borderGray bg-white px-3.5 py-2 text-xs font-bold text-textDark hover:border-primary hover:text-primary transition-all shadow-sm"
          >
            <FaCheckDouble size={12} className="text-tertiary" />
            تحديد الكل كمقروء
          </button>
        )}
      </div>

      {isLoading ? (
        <LoadingSpinner text="جاري تحميل إشعارات الإدارة..." />
      ) : !notifications || notifications.length === 0 ? (
        <div className="empty-state card py-16">
          <div className="empty-state-icon">🔔</div>
          <p className="empty-state-title">لا توجد إشعارات إدارية جديدة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <button
              key={n._id}
              type="button"
              onClick={() => handleOpen(n)}
              className={`card w-full text-right transition-all hover:shadow-md ${
                !n.isRead ? 'border-r-4 border-r-primary bg-primary/5' : 'bg-white opacity-85'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${!n.isRead ? 'font-bold text-textDark' : 'font-semibold text-textDark/80'}`}>{n.title}</p>
                  <p className="text-xs text-textGray mt-1 leading-relaxed">{n.body}</p>
                  <p className="text-[11px] text-textGray/80 mt-2">{formatDate(n.createdAt)}</p>
                </div>
                {!n.isRead && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-secondary mt-1.5" />}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
