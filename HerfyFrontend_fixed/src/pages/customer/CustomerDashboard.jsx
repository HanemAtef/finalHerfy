import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { FaWrench, FaBolt, FaChevronLeft, FaArrowRight, FaComments, FaCreditCard, FaMoneyBillWave, FaExclamationTriangle } from 'react-icons/fa';
import { getCustomerOrders } from '../../store/slices/orderSlice';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { formatDate, formatPrice, ORDER_STATUS_LABELS } from '../../utils/helpers';

const statusColors = {
  completed: 'bg-tertiary/10 text-tertiary',
  pending: 'bg-secondary/10 text-secondary',
  cancelled: 'bg-emergency/10 text-emergency',
  accepted: 'bg-primary/10 text-primary',
  'in-progress': 'bg-primary/10 text-primary',
};

const CHAT_OPEN_STATUSES = ['pending', 'accepted', 'price_confirmed', 'in-progress'];

export default function CustomerDashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const { orders, isLoading } = useSelector((state) => state.orders);

  useEffect(() => {
    if (user?._id) dispatch(getCustomerOrders(user._id));
  }, [dispatch, user?._id]);

  const completed = orders.filter((o) => o.status === 'completed').length;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-full p-2 text-primary hover:bg-primary/5"
            aria-label="رجوع"
          >
            <FaArrowRight />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-textDark">حجوزاتي</h1>
            <p className="text-sm text-textGray">تتبع جميع طلباتك وحالتها</p>
          </div>
        </div>
      </div>


      {/* Penalty warning banner */}
      {user?.penaltyAmount > 0 && (
        <div className="mb-6 flex items-center justify-between rounded-2xl bg-secondary/10 p-4">
          <div className="flex items-center gap-3">
            <FaExclamationTriangle className="text-secondary" size={24} />
            <div>
              <p className="font-bold text-secondary">غرامة مستحقة</p>
              <p className="text-sm text-textDark">
                لديك غرامة بقيمة {user.penaltyAmount} ج.م. سدد الغرامة قبل إنشاء طلب جديد.
              </p>
            </div>
          </div>
          <Link
            to="/customer/profile"
            className="shrink-0 rounded-lg bg-secondary px-4 py-2 text-sm font-bold text-white transition-all hover:bg-secondary/90"
          >
            تسوية
          </Link>
        </div>
      )}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card bg-primary text-white">
          <p className="text-sm opacity-80">ملخص النشاط</p>
          <p className="mt-2 text-2xl font-bold">{orders.length}</p>
          <p className="text-sm opacity-80">إجمالي الحجوزات</p>
          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-tertiary" />
            {completed} مكتمل
          </div>
        </div>
        <div className="card sm:col-span-2">
          <h3 className="mb-4 font-bold text-textDark">آخر الحجوزات</h3>
          {isLoading ? (
            <LoadingSpinner />
          ) : orders.length === 0 ? (
            <p className="text-center text-textGray py-8">لا توجد حجوزات بعد</p>
          ) : (
            <div className="space-y-3">
              {orders.slice(0, 5).map((order) => (
                <div
                  key={order._id}
                  className="flex items-center gap-2 rounded-xl border border-borderGray p-2 transition hover:shadow-sm"
                >
                  <Link
                    to={['completed', 'cancelled'].includes(order.status)
                      ? `/customer/orders/${order._id}`
                      : `/customer/tracking/${order._id}`}
                    className="flex min-w-0 flex-1 items-center gap-4 p-2"
                  >
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {order.profession?.includes('كهرب') ? <FaBolt /> : <FaWrench />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-textDark truncate">{order.profession}</p>
                    <p className="text-xs text-textGray">{formatDate(order.createdAt)}</p>
                  </div>
                  <div className="text-left">
                    <p className="font-bold">{formatPrice(order.totalPrice || order.estimatedPrice)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[order.status] || ''}`}>
                      {ORDER_STATUS_LABELS[order.status] || order.status}
                    </span>
                    {order.status === 'completed' && order.paymentStatus !== 'paid' && (
                      order.paymentMethod === 'cash' && order.paymentStatus === 'pending' ? (
                        <span className="mt-1 flex items-center gap-1 text-xs font-bold text-amber-600">
                          <FaMoneyBillWave size={10} /> في انتظار تأكيد الدفع
                        </span>
                      ) : order.paymentMethod === 'card' && order.paymentStatus === 'pending' ? (
                        <button
                          type="button"
                          className="mt-1 flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
                          // This control is rendered inside the order's review Link.
                          // Stopping propagation alone does not stop an anchor's default
                          // navigation, which previously sent the user to review right
                          // after this handler navigated to the payment page.
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/customer/payment/${order._id}`);
                          }}
                        >
                          <FaCreditCard size={10} /> متابعة الدفع
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="mt-1 flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/customer/tracking/${order._id}`);
                          }}
                        >
                          <FaCreditCard size={10} /> ادفع الآن
                        </button>
                      )
                    )}
                  </div>
                  <FaChevronLeft className="text-textGray shrink-0" />
                  </Link>
                  {CHAT_OPEN_STATUSES.includes(order.status) && (
                    <Link
                      to={`/chat/${order._id}`}
                      className="rounded-lg p-3 text-primary hover:bg-primary/10"
                      title="Chat with the handyman"
                      aria-label="Chat with the handyman"
                    >
                      <FaComments />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
