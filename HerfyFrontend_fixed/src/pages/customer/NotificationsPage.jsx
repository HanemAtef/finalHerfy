import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight, FaBell } from 'react-icons/fa';
import { getNotifications, markAsRead, markAllAsRead } from '../../store/slices/notificationSlice';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { formatDate, getEffectiveRole } from '../../utils/helpers';

// Where a notification should take you, based on its type + the current
// user's role. Falls back to doing nothing (just marks as read) when there's
// no sensible destination (e.g. account_blocked, promotion).
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
      // These land on the handyman first ("new order for you") but can also
      // be sent back to the customer ("handyman responded") — either way
      // it's their copy of that order.
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
                {!n.isRead && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-secondary mt-2" />
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
