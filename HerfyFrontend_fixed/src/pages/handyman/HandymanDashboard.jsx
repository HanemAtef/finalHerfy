import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  FaClipboardList,
  FaStar,
  FaMoneyBillWave,
  FaCheck,
  FaTimes,
  FaEdit,
} from 'react-icons/fa';
import { getPendingOrders, updateOrderStatus } from '../../store/slices/orderSlice';
import { handymanService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { formatPrice, getDefaultAvatar } from '../../utils/helpers';

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 17 ? 'صباح الخير' : 'مساء الخير';
};

export default function HandymanDashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const { orders, isLoading } = useSelector((state) => state.orders);
  const [available, setAvailable] = useState(true);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    if (user?._id) {
      dispatch(getPendingOrders(user._id));
      handymanService.getAnalytics(user._id).then((res) => setAnalytics(res.data)).catch(() => {});
      // Reflect the handyman's real saved availability instead of always
      // defaulting the toggle to "available" on every page load.
      handymanService
        .getById(user._id)
        .then((res) => {
          const isAvailable = res.data?.isAvailable ?? res.data?.handyman?.isAvailable;
          if (typeof isAvailable === 'boolean') setAvailable(isAvailable);
        })
        .catch(() => {});
    }
  }, [dispatch, user?._id]);

  const handleAvailability = async (value) => {
    setAvailable(value);
    try {
      await handymanService.toggleAvailability(user._id, { isAvailable: value });
    } catch {
      setAvailable(!value);
    }
  };

  // Rejecting doesn't need a price, so it can stay a one-click action here.
  // Accepting DOES require the handyman to set a price first, so that flow
  // lives on the order details page instead of firing blind from this list.
  const handleReject = (orderId) => {
    dispatch(updateOrderStatus({ id: orderId, status: 'cancelled' }));
  };

  return (
    <div>
      <div className="card mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-textDark">{greeting()}، {user?.name?.split(' ')[0]}</h1>
            <p className="text-sm text-textGray">
              لديك {orders.length} طلب{orders.length !== 1 ? 'ات' : ''} جديد{orders.length !== 1 ? 'ة' : ''} اليوم
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-xl overflow-hidden border border-borderGray">
              <button
                type="button"
                onClick={() => handleAvailability(true)}
                className={`px-4 py-2 text-sm font-bold flex items-center gap-2 ${
                  available ? 'bg-tertiary text-white' : 'bg-white text-textGray'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-white" /> متاح
              </button>
              <button
                type="button"
                onClick={() => handleAvailability(false)}
                className={`px-4 py-2 text-sm font-bold ${
                  !available ? 'bg-textGray text-white' : 'bg-white text-textGray'
                }`}
              >
                مشغول
              </button>
            </div>
            <button
              type="button"
              onClick={() => navigate('/handyman/profile')}
              className="btn-outline flex items-center gap-2 text-sm py-2"
            >
              <FaEdit /> تعديل الملف الشخصي
            </button>
          </div>
        </div>
      </div>

      {analytics?.walletBalance > 0 && (
        <div
          className={`card mb-6 flex flex-wrap items-center justify-between gap-3 border-r-4 ${
            analytics.isSuspended ? 'border-emergency bg-emergency/5' : 'border-secondary bg-secondary/5'
          }`}
        >
          <div>
            <p className="font-bold text-textDark">
              رصيد العمولة المستحقة عليك: <span className="text-secondary">{formatPrice(analytics.walletBalance)}</span>
            </p>
            <p className="text-sm text-textGray">
              {analytics.isSuspended
                ? `حسابك معلّق حتى تسوية الرصيد${analytics.suspendedReason ? `: ${analytics.suspendedReason}` : ''}`
                : 'عمولة المنصة على الطلبات المدفوعة كاش — يُرجى التسوية مع فريق الدعم'}
            </p>
          </div>
          {analytics.isSuspended && (
            <span className="rounded-full bg-emergency px-3 py-1 text-xs font-bold text-white">الحساب معلّق</span>
          )}
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            icon: FaStar,
            color: 'border-tertiary',
            title: 'متوسط التقييم',
            value: analytics ? analytics.rating.toFixed(1) : '—',
            sub: 'بناءً على تقييمات حقيقية',
          },
          {
            icon: FaMoneyBillWave,
            color: 'border-secondary',
            title: 'إجمالي الأرباح',
            value: analytics ? formatPrice(analytics.totalEarnings) : '—',
            sub: `${analytics?.completedOrders ?? 0} طلب مكتمل`,
          },
          {
            icon: FaClipboardList,
            color: 'border-primary',
            title: 'طلبات قيد الانتظار',
            value: orders.length,
            sub: `${analytics?.totalOrders ?? 0} إجمالي الطلبات`,
          },
        ].map(({ icon: Icon, color, title, value, sub }) => (
          <div key={title} className={`card border-r-4 ${color}`}>
            <Icon className="mb-2 text-textGray" size={20} />
            <p className="text-sm text-textGray">{title}</p>
            <p className="text-2xl font-bold text-textDark">{value}</p>
            <p className="text-xs text-tertiary">{sub}</p>
          </div>
        ))}
      </div>

      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-bold text-textDark">
            <FaClipboardList className="text-primary" /> الطلبات الواردة
          </h2>
          <Link to="/handyman/orders" className="text-sm text-primary">عرض الكل ←</Link>
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : orders.length === 0 ? (
          <div className="card text-center py-8 text-textGray">لا توجد طلبات واردة</div>
        ) : (
          <div className="space-y-3">
            {orders.slice(0, 5).map((order) => (
              <div key={order._id} className="card flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <img
                    src={getDefaultAvatar(order.customerId?.name || 'عميل')}
                    alt=""
                    className="h-12 w-12 rounded-full"
                  />
                  <div>
                    <p className="font-bold text-textDark">{order.customerId?.name || 'عميل'}</p>
                    <p className="text-sm text-textGray">{order.profession}</p>
                    <p className="text-xs text-textGray">2 كم بعيد</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    to={`/handyman/orders/${order._id}`}
                    className="flex items-center gap-2 rounded-lg bg-tertiary px-4 py-2 text-sm font-bold text-white"
                  >
                    <FaCheck /> مراجعة وقبول
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleReject(order._id)}
                    className="flex items-center gap-2 rounded-lg border-2 border-emergency px-4 py-2 text-sm font-bold text-emergency"
                  >
                    <FaTimes /> رفض
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card border-2 border-dashed border-borderGray text-center py-8">
          <p className="text-3xl text-textGray mb-2">+</p>
          <p className="font-bold text-textDark">تحديث الجدول الأسبوعي</p>
          <p className="text-sm text-textGray">حدد ساعات عملك للأسبوع القادم</p>
        </div>
        <div className="card bg-primary text-white">
          <h3 className="font-bold mb-2">أكمل ملفك الشخصي</h3>
          <p className="text-sm opacity-80 mb-4">إضافة صور للأعمال السابقة يزيد فرص اختيارك بنسبة 40%</p>
          <button type="button" className="btn-secondary text-sm">أضف صوراً الآن</button>
        </div>
      </div>
    </div>
  );
}
