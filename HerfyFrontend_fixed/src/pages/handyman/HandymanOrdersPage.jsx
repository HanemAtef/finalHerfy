import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { FaArrowRight, FaCalendarAlt, FaMoneyBillWave, FaUser } from 'react-icons/fa';
import { getHandymanOrders } from '../../store/slices/orderSlice';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { formatDate, formatPrice, ORDER_STATUS_LABELS } from '../../utils/helpers';

const FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'pending', label: 'قيد الانتظار' },
  { key: 'accepted', label: 'مقبول' },
  { key: 'scheduled', label: 'تم تحديد الموعد' },
  { key: 'on_the_way', label: 'في الطريق' },
  { key: 'arrived', label: 'وصل الحرفي' },
  { key: 'in-progress', label: 'قيد التنفيذ' },
  { key: 'completed', label: 'مكتمل' },
  { key: 'cancelled', label: 'ملغي' },
  { key: 'disputed', label: 'محل نزاع' },
];

const statusColors = {
  pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  accepted: 'bg-blue-50 text-blue-700 border border-blue-200',
  scheduled: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  price_confirmed: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  on_the_way: 'bg-purple-50 text-purple-700 border border-purple-200',
  'on-the-way': 'bg-purple-50 text-purple-700 border border-purple-200',
  arrived: 'bg-teal-50 text-teal-700 border border-teal-200',
  'in-progress': 'bg-primary/10 text-primary border border-primary/20',
  in_progress: 'bg-primary/10 text-primary border border-primary/20',
  completed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border border-red-200',
  disputed: 'bg-amber-50 text-amber-700 border border-amber-200',
};

const statusAccentColors = {
  pending: 'bg-secondary',
  accepted: 'bg-primary',
  scheduled: 'bg-indigo-500',
  price_confirmed: 'bg-indigo-500',
  on_the_way: 'bg-purple-500',
  'on-the-way': 'bg-purple-500',
  arrived: 'bg-teal-500',
  'in-progress': 'bg-primary',
  in_progress: 'bg-primary',
  completed: 'bg-tertiary',
  cancelled: 'bg-emergency',
  disputed: 'bg-amber-500',
};

function HandymanOrdersContent() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const { orders, isLoading, error } = useSelector((state) => state.orders);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (user?._id) dispatch(getHandymanOrders(user._id));
  }, [dispatch, user?._id]);

  const orderList = Array.isArray(orders) ? orders : [];
  const filtered =
    filter === 'all' ? orderList : orderList.filter((o) => o && o.status === filter);

  return (
    <div className="space-y-6">
      {/* Header */}
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
          <h1 className="text-2xl font-extrabold text-textDark">جميع الطلبات</h1>
          <p className="text-xs text-textGray mt-0.5">إدارة ومتابعة كافة الطلبات الواردة والسابقة</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              filter === key
                ? 'bg-primary text-white shadow-sm'
                : 'border border-borderGray bg-white text-textGray hover:border-primary/40 hover:text-textDark'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Orders Grid */}
      {isLoading ? (
        <LoadingSpinner text="جاري تحميل الطلبات..." />
      ) : error ? (
        <div className="card text-center text-emergency py-8">
          <p className="font-bold mb-1">تعذر تحميل الطلبات</p>
          <p className="text-xs text-textGray">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card py-16">
          <div className="empty-state-icon">📭</div>
          <p className="empty-state-title">لا توجد طلبات تطابق الفلتر</p>
          <p className="empty-state-desc">اختر تصنيفاً آخر لعرض الطلبات السابقة أو الحالية</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((order) => {
            if (!order || !order._id) return null;
            const statusStyle = statusColors[order.status] || 'bg-neutral text-textDark';
            const accentStyle = statusAccentColors[order.status] || 'bg-borderGray';
            const statusLabel = ORDER_STATUS_LABELS[order.status] || order.status || 'غير محدد';

            return (
              <Link
                key={order._id}
                to={`/handyman/orders/${order._id}`}
                className="group relative flex flex-col justify-between rounded-2xl bg-white p-5 border border-neutral shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)] overflow-hidden"
              >
                {/* Top Accent Line */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${accentStyle}`} />
                
                <div>
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <h2 className="font-bold text-textDark text-base truncate group-hover:text-primary transition-colors">
                      {order.profession || 'خدمة صيانة'}
                    </h2>
                    <span className={`badge-status text-[11px] shrink-0 font-bold ${statusStyle}`}>
                      {statusLabel}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-textGray flex items-center gap-1.5">
                    <FaUser size={10} className="text-primary/70" />
                    {order.customerId?.name || 'عميل'}
                  </p>
                </div>
                
                <div className="flex justify-between items-end mt-4 pt-3.5 border-t border-neutral text-xs">
                  <div>
                    <span className="text-textGray text-[11px] block">تاريخ الطلب</span>
                    <span className="font-semibold text-textDark mt-0.5 block">{formatDate(order.createdAt)}</span>
                  </div>
                  <div className="text-left">
                    <span className="text-textGray text-[11px] block">السعر</span>
                    <span className="font-extrabold text-sm text-primary mt-0.5 block">
                      {formatPrice(order.price ?? order.totalPrice ?? order.estimatedPrice)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function HandymanOrdersPage() {
  return (
    <ErrorBoundary>
      <HandymanOrdersContent />
    </ErrorBoundary>
  );
}
