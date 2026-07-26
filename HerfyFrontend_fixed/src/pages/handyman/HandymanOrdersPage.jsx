import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { FaArrowRight } from 'react-icons/fa';
import { getHandymanOrders } from '../../store/slices/orderSlice';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { formatDate, formatPrice, ORDER_STATUS_LABELS } from '../../utils/helpers';

const FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'pending', label: 'قيد الانتظار' },
  { key: 'accepted', label: 'مقبول' },
  { key: 'in-progress', label: 'قيد التنفيذ' },
  { key: 'completed', label: 'مكتمل' },
  { key: 'cancelled', label: 'ملغي' },
];

const statusColors = {
  pending: 'bg-secondary/10 text-secondary',
  accepted: 'bg-primary/10 text-primary',
  'in-progress': 'bg-primary/10 text-primary',
  completed: 'bg-tertiary/10 text-tertiary',
  cancelled: 'bg-emergency/10 text-emergency',
};

export default function HandymanOrdersPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const { orders, isLoading } = useSelector((state) => state.orders);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (user?._id) dispatch(getHandymanOrders(user._id));
  }, [dispatch, user?._id]);

  const filtered =
    filter === 'all' ? orders : orders.filter((o) => o.status === filter);

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

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              filter === key ? 'bg-primary text-white' : 'border border-borderGray bg-white text-textGray'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <div className="card py-12 text-center text-textGray">لا توجد طلبات</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <Link
              key={order._id}
              to={`/handyman/orders/${order._id}`}
              className="card flex flex-wrap items-center justify-between gap-4 transition hover:shadow-md"
            >
              <div>
                <p className="font-bold text-textDark">{order.profession}</p>
                <p className="text-sm text-textGray">{order.customerId?.name}</p>
                <p className="text-xs text-textGray">{formatDate(order.createdAt)}</p>
              </div>
              <div className="text-left">
                <p className="font-bold">{formatPrice(order.totalPrice || order.estimatedPrice)}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[order.status]}`}>
                  {ORDER_STATUS_LABELS[order.status]}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
