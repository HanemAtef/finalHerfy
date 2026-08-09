import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight, FaBell } from 'react-icons/fa';
import { getNotifications, markAsRead, markAllAsRead } from '../../store/slices/notificationSlice';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { formatDate } from '../../utils/helpers';

// Admin notifications are mostly system/report alerts rather than order
// updates, so we only navigate when there's a clear admin destination.
const resolveDestination = (notification) => {
  switch (notification.type) {
    case 'report_created':
    case 'dispute_created':
      return '/admin/reports';
    case 'handyman_registered':
    case 'verification_request':
      return '/admin/verifications';
    default:
      return null;
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
    if (!n.isRead) dispatch(markAsRead(n._id));
    const destination = resolveDestination(n);
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
          className="text-sm text-primary hover:underline"
        >
          تحديد الكل كمقروء
        </button>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : notifications.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-16 text-center text-textGray">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral">
            <FaBell size={26} className="text-borderGray" />
          </span>
          <p className="font-medium">لا توجد إشعارات حالياً</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <button
              key={n._id}
              type="button"
              onClick={() => handleOpen(n)}
              className={`card w-full text-right transition hover:shadow-md ${
                !n.isRead ? 'border-r-4 border-primary bg-primary/5' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="font-bold text-textDark">{n.title}</p>
                  <p className="text-sm text-textGray mt-1">{n.body}</p>
                  <p className="text-xs text-textGray mt-2">{formatDate(n.createdAt)}</p>
                </div>
                {!n.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-secondary mt-2" />}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
