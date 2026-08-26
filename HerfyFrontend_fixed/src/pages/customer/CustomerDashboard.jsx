import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  FaWrench,
  FaBolt,
  FaChevronLeft,
  FaArrowRight,
  FaComments,
  FaCreditCard,
  FaMoneyBillWave,
  FaExclamationTriangle,
  FaHeadset,
  FaCalendarCheck,
  FaClipboardList,
} from 'react-icons/fa';
import { getCustomerOrders } from '../../store/slices/orderSlice';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { formatDate, formatDateTime, formatPrice, ORDER_STATUS_LABELS } from '../../utils/helpers';

const statusColors = {
  completed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  cancelled: 'bg-red-50 text-red-700 border border-red-200',
  accepted: 'bg-blue-50 text-blue-700 border border-blue-200',
  scheduled: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  price_confirmed: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  on_the_way: 'bg-purple-50 text-purple-700 border border-purple-200',
  'on-the-way': 'bg-purple-50 text-purple-700 border border-purple-200',
  arrived: 'bg-teal-50 text-teal-700 border border-teal-200',
  'in-progress': 'bg-primary/10 text-primary border border-primary/20',
  in_progress: 'bg-primary/10 text-primary border border-primary/20',
};

export default function CustomerDashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const { orders, isLoading } = useSelector((state) => state.orders);

  useEffect(() => {
    if (user?._id) dispatch(getCustomerOrders(user._id));
  }, [dispatch, user?._id]);

  const completed = orders.filter((o) => o.status === 'completed').length;
  const activeOrders = orders.filter((o) => ['pending', 'accepted', 'price_confirmed', 'in-progress'].includes(o.status)).length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
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
            <h1 className="text-2xl font-extrabold text-textDark">حجوزاتي</h1>
            <p className="text-xs text-textGray mt-0.5">تتبع طلبات الصيانة وحالتها خطوة بخطوة</p>
          </div>
        </div>

        <Link
          to="/customer/support"
          className="btn-primary text-xs py-2.5 px-4 shadow-sm"
        >
          <FaHeadset size={14} />
          <span>تواصل مع الإدارة</span>
        </Link>
      </div>

      {/* Penalty Warning Banner */}
      {user?.penaltyAmount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-secondary/5 border border-secondary/20 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/10 text-secondary shrink-0">
              <FaExclamationTriangle size={18} />
            </div>
            <div>
              <p className="font-bold text-secondary text-sm">غرامة مستحقة على الحساب</p>
              <p className="text-xs text-textDark mt-0.5">
                لديك غرامة بقيمة <span className="font-bold text-secondary">{user.penaltyAmount} ج.م</span>. يرجى تسويتها لتتمكن من إنشاء طلبات جديدة.
              </p>
            </div>
          </div>
          <Link
            to="/customer/profile"
            className="rounded-xl bg-secondary px-4 py-2 text-xs font-bold text-white transition-all hover:bg-secondary/90 shadow-sm"
          >
            تسوية الآن
          </Link>
        </div>
      )}

      {/* Pending Reschedule Requests Banner */}
      {orders.some((o) => ['scheduled', 'price_confirmed'].includes(o.status) && o.rescheduleRequest?.status === 'pending' && o.rescheduleRequest?.requestedBy === 'handyman') && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 shrink-0">
              <FaCalendarCheck size={18} />
            </div>
            <div>
              <p className="font-bold text-amber-800 text-sm">لديك طلب إعادة جدولة جديد قيد الانتظار</p>
              <p className="text-xs text-textDark mt-0.5">
                طلب الحرفي تغيير موعد أحد الطلبات. يرجى مراجعة تفاصيل الطلب للموافقة أو الرفض.
              </p>
            </div>
          </div>
          <Link
            to={`/customer/tracking/${orders.find((o) => ['scheduled', 'price_confirmed'].includes(o.status) && o.rescheduleRequest?.status === 'pending' && o.rescheduleRequest?.requestedBy === 'handyman')?._id}`}
            className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white transition-all hover:bg-amber-700 shadow-sm"
          >
            عرض الطلب والموافقة
          </Link>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Total Bookings */}
        <div className="stat-card border-r-4 border-r-primary">
          <div className="flex items-center justify-between">
            <span className="stat-label">إجمالي الحجوزات</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FaClipboardList size={16} />
            </div>
          </div>
          <p className="stat-value">{orders.length}</p>
          <div className="flex items-center gap-2 text-xs text-textGray mt-1">
            <span className="h-2 w-2 rounded-full bg-primary" />
            كل الطلبات السابقة والنشطة
          </div>
        </div>

        {/* Completed Bookings */}
        <div className="stat-card border-r-4 border-r-tertiary">
          <div className="flex items-center justify-between">
            <span className="stat-label">الطلبات المكتملة</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tertiary/10 text-tertiary">
              <FaCalendarCheck size={16} />
            </div>
          </div>
          <p className="stat-value">{completed}</p>
          <div className="flex items-center gap-2 text-xs text-tertiary font-semibold mt-1">
            <span className="h-2 w-2 rounded-full bg-tertiary" />
            تم تنفيذها بنجاح
          </div>
        </div>

        {/* Active Bookings */}
        <div className="stat-card border-r-4 border-r-secondary">
          <div className="flex items-center justify-between">
            <span className="stat-label">الطلبات النشطة</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
              <FaWrench size={16} />
            </div>
          </div>
          <p className="stat-value">{activeOrders}</p>
          <div className="flex items-center gap-2 text-xs text-secondary font-semibold mt-1">
            <span className="h-2 w-2 rounded-full bg-secondary animate-pulse" />
            قيد المتابعة والتنفيذ
          </div>
        </div>
      </div>

      {/* Recent Bookings List */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-textDark text-base">سجل الحجوزات والطلبات</h2>
          <span className="text-xs text-textGray font-semibold bg-neutral px-2.5 py-1 rounded-full">{orders.length} طلب</span>
        </div>

        {isLoading ? (
          <LoadingSpinner text="جاري تحميل سجل الحجوزات..." />
        ) : orders.length === 0 ? (
          <div className="empty-state py-12">
            <div className="empty-state-icon">📋</div>
            <p className="empty-state-title">لا توجد حجوزات بعد</p>
            <p className="empty-state-desc">ابدأ بالبحث عن الحرفي المناسب واطلب خدمتك الأولى الآن</p>
            <Link to="/customer/home" className="btn-primary mt-4 text-xs py-2 px-5">
              استكشف الحرفيين
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div
                key={order._id}
                className="group flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 rounded-2xl border border-neutral bg-white p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-sm"
              >
                <Link
                  to={['completed', 'cancelled'].includes(order.status)
                    ? `/customer/orders/${order._id}`
                    : `/customer/tracking/${order._id}`}
                  className="flex min-w-0 flex-1 items-center gap-3.5"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shrink-0 transition-transform group-hover:scale-105">
                    {order.profession?.includes('كهرب') ? <FaBolt size={18} /> : <FaWrench size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-textDark text-sm truncate group-hover:text-primary transition-colors">{order.profession}</p>
                    <p className="text-xs text-textGray mt-0.5">{formatDateTime(order.scheduledDate || order.createdAt, order.scheduledTime)}</p>
                  </div>
                  <div className="text-left shrink-0 pl-2">
                    <p className="font-extrabold text-sm text-textDark">{formatPrice(order.totalPrice || order.estimatedPrice)}</p>
                    <span className={`badge-status text-[11px] mt-1 ${statusColors[order.status] || ''}`}>
                      {ORDER_STATUS_LABELS[order.status] || order.status}
                    </span>
                    {order.status === 'completed' && order.paymentStatus !== 'paid' && (
                      order.paymentMethod === 'cash' && order.paymentStatus === 'pending' ? (
                        <span className="mt-1 flex items-center gap-1 text-[10px] font-bold text-amber-600">
                          <FaMoneyBillWave size={9} /> في انتظار تأكيد الكاش
                        </span>
                      ) : order.paymentMethod === 'card' && order.paymentStatus === 'pending' ? (
                        <button
                          type="button"
                          className="mt-1 flex items-center gap-1 text-[10px] font-bold text-primary hover:underline"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/customer/payment/${order._id}`);
                          }}
                        >
                          <FaCreditCard size={9} /> دفع بالبطاقة
                        </button>
                      ) : (
                        <span className="mt-1 block text-[10px] font-bold text-amber-600">غير مدفوع</span>
                      )
                    )}
                    {order.status === 'completed' && order.paymentStatus === 'paid' && (
                      <span className="mt-1 block text-[10px] font-bold text-emerald-600">تم الدفع ✓</span>
                    )}
                  </div>
                </Link>

                <div className="flex items-center gap-1.5 shrink-0">
                  {['pending', 'accepted', 'price_confirmed', 'in-progress'].includes(order.status) && (
                    <Link
                      to={`/chat/${order._id}`}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all"
                      title="محادثة الحرفي"
                    >
                      <FaComments size={15} />
                    </Link>
                  )}
                  <Link
                    to={['completed', 'cancelled'].includes(order.status)
                      ? `/customer/orders/${order._id}`
                      : `/customer/tracking/${order._id}`}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-textGray hover:bg-neutral transition-colors"
                  >
                    <FaChevronLeft size={12} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
