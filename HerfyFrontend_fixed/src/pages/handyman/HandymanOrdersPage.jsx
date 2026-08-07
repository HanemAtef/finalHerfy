import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { FaArrowRight } from 'react-icons/fa';
import { getHandymanOrders } from '../../store/slices/orderSlice';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { formatDate, formatPrice, ORDER_STATUS_LABELS } from '../../utils/helpers';

const FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'pending', label: 'قيد الانتظار' },
  { key: 'accepted', label: 'مقبول' },
  { key: 'price_confirmed', label: 'مؤكد السعر' },
  { key: 'in-progress', label: 'قيد التنفيذ' },
  { key: 'completed', label: 'مكتمل' },
  { key: 'cancelled', label: 'ملغي' },
  { key: 'disputed', label: 'محل نزاع' },
];

const statusColors = {
  pending: 'bg-secondary/10 text-secondary',
  accepted: 'bg-primary/10 text-primary',
  price_confirmed: 'bg-orange-500/10 text-orange-600',
  'in-progress': 'bg-primary/10 text-primary',
  completed: 'bg-tertiary/10 text-tertiary',
  cancelled: 'bg-emergency/10 text-emergency',
  disputed: 'bg-amber-500/10 text-amber-700',
};

const statusAccentColors = {
  pending: 'bg-secondary',
  accepted: 'bg-primary',
  price_confirmed: 'bg-orange-500',
  'in-progress': 'bg-primary',
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
    <div>
      <h1 className="mb-2 flex items-center gap-3 text-2xl font-bold text-textDark">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-full p-2 text-primary hover:bg-primary/5"
          aria-label="رجوع"
        >
          <FaArrowRight size={18} />
        </button>
        جميع الطلبات
      </h1>
      <p className="mb-6 text-sm text-textGray">إدارة ومتابعة جميع طلباتك</p>

      <div className="mb-6 flex flex-wrap gap-2 rounded-2xl bg-white p-2 shadow-sm w-fit border border-neutral">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-300 ${
              filter === key ? 'bg-primary text-white shadow-md' : 'bg-transparent text-textGray hover:bg-neutral'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="rounded-2xl border border-emergency/30 bg-emergency/5 p-6 text-center text-emergency">
          <p className="font-bold mb-1">تعذر تحميل الطلبات</p>
          <p className="text-sm">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-borderGray bg-white/50 py-16 text-center text-textGray flex flex-col items-center justify-center">
          <div className="text-5xl mb-4 opacity-50">📭</div>
          <p className="font-semibold text-lg">لا توجد طلبات</p>
          <p className="text-sm">لم يتم العثور على أي طلبات تطابق الفلتر المحدد.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((order) => {
            if (!order || !order._id) return null;
            const statusStyle = statusColors[order.status] || 'bg-gray-100 text-gray-700';
            const accentStyle = statusAccentColors[order.status] || 'bg-gray-400';
            const statusLabel = ORDER_STATUS_LABELS[order.status] || order.status || 'غير محدد';

            return (
              <Link
                key={order._id}
                to={`/handyman/orders/${order._id}`}
                className="rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-neutral flex flex-col justify-between gap-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg relative overflow-hidden"
              >
                {/* Top Accent Line */}
                <div className={`absolute top-0 left-0 w-full h-1 ${accentStyle}`} />
                
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-textDark text-lg">{order.profession || 'خدمة عامة'}</p>
                    <p className="text-sm font-medium text-textGray mt-0.5">{order.customerId?.name || 'عميل'}</p>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${statusStyle}`}>
                    {statusLabel}
                  </span>
                </div>
                
                <div className="flex justify-between items-end mt-2 pt-4 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-textGray mb-1">تاريخ الطلب</p>
                    <p className="text-sm font-semibold">{formatDate(order.createdAt)}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-textGray mb-1">التكلفة</p>
                    <p className="font-bold text-secondary text-lg">
                      {formatPrice(order.price ?? order.totalPrice ?? order.estimatedPrice)}
                    </p>
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

