// HerfyFrontend_fixed/src/pages/handyman/HandymanDashboard.jsx
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
  FaHourglassHalf,
  FaExclamationCircle,
  FaBan,
  FaArrowRight,
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
  const [registrationStatus, setRegistrationStatus] = useState(null);
  const [statusNote, setStatusNote] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  useEffect(() => {
    // Check handyman registration status
    const checkStatus = async () => {
      try {
        const res = await handymanService.getStatus();
        setRegistrationStatus(res.data.status);
        setStatusNote(res.data.note);
      } catch (error) {
        console.error('Error fetching status:', error);
        // If error, try to get from user data
        if (user?.registrationStatus) {
          setRegistrationStatus(user.registrationStatus);
        }
      } finally {
        setLoadingStatus(false);
      }
    };

    checkStatus();
  }, [user]);

  useEffect(() => {
    if (user?._id && registrationStatus === 'approved') {
      dispatch(getPendingOrders(user._id));
      handymanService.getAnalytics(user._id).then((res) => setAnalytics(res.data)).catch(() => {});
      handymanService
        .getById(user._id)
        .then((res) => {
          const isAvailable = res.data?.isAvailable ?? res.data?.handyman?.isAvailable;
          if (typeof isAvailable === 'boolean') setAvailable(isAvailable);
        })
        .catch(() => {});
    }
  }, [dispatch, user?._id, registrationStatus]);

  const handleAvailability = async (value) => {
    setAvailable(value);
    try {
      await handymanService.toggleAvailability(user._id, { isAvailable: value });
    } catch {
      setAvailable(!value);
    }
  };

  const handleReject = (orderId) => {
    dispatch(updateOrderStatus({ id: orderId, status: 'cancelled' }));
  };

  // =====================================================
  // ========== RENDER BASED ON REGISTRATION STATUS ==========
  // =====================================================

  // Show loading while checking status
  if (loadingStatus) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner />
        <p className="mr-3 text-textGray">جاري التحقق من حالة الحساب...</p>
      </div>
    );
  }

  // Case 1: Registration is pending
  if (registrationStatus === 'pending') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
        <div className="text-center">
          <div className="mb-6 text-6xl">⏳</div>
          <h2 className="mb-3 text-2xl font-bold text-warning">في انتظار موافقة الأدمن</h2>
          <div className="mx-auto max-w-md">
            <p className="mb-4 text-textGray">
              تم استلام طلب التسجيل الخاص بك بنجاح. سيتم مراجعته من قبل فريق الأدمن وسيتم إعلامك عند الموافقة.
            </p>
            {statusNote && (
              <div className="mb-4 rounded-lg bg-warning/10 p-4 text-sm text-warning">
                <FaHourglassHalf className="inline mr-2" />
                {statusNote}
              </div>
            )}
            <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-600">
              <p className="flex items-center gap-2">
                <FaExclamationCircle />
                يرجى التحقق من بريدك الإلكتروني بشكل دوري للإشعارات
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/')}
            className="mt-6 btn-outline flex items-center gap-2"
          >
            <FaArrowRight /> العودة للرئيسية
          </button>
        </div>
      </div>
    );
  }

  // Case 2: Registration is rejected
  if (registrationStatus === 'rejected') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
        <div className="text-center">
          <div className="mb-6 text-6xl">❌</div>
          <h2 className="mb-3 text-2xl font-bold text-danger">تم رفض طلب التسجيل</h2>
          <div className="mx-auto max-w-md">
            <p className="mb-4 text-textGray">
              نأسف لإبلاغك بأن طلب التسجيل الخاص بك كحرفي في منصة حرفي لم يتم الموافقة عليه.
            </p>
            {statusNote && (
              <div className="mb-4 rounded-lg bg-danger/10 p-4 text-sm text-danger">
                <FaBan className="inline mr-2" />
                <strong>سبب الرفض:</strong> {statusNote}
              </div>
            )}
            <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
              <p>يمكنك محاولة التقديم مرة أخرى مع التأكد من استيفاء جميع الشروط المطلوبة.</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => navigate('/handyman/register')}
              className="btn-secondary flex items-center gap-2"
            >
              إعادة التقديم
            </button>
            <button
              onClick={() => navigate('/')}
              className="btn-outline flex items-center gap-2"
            >
              العودة للرئيسية
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Case 3: Handyman is suspended
  if (analytics?.isSuspended) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
        <div className="text-center">
          <div className="mb-6 text-6xl">🚫</div>
          <h2 className="mb-3 text-2xl font-bold text-danger">الحساب معلق مؤقتاً</h2>
          <div className="mx-auto max-w-md">
            <p className="mb-4 text-textGray">
              عذراً، حسابك معلق حالياً. يرجى التواصل مع فريق الدعم لحل المشكلة.
            </p>
            {analytics?.suspendedReason && (
              <div className="mb-4 rounded-lg bg-danger/10 p-4 text-sm text-danger">
                <FaBan className="inline mr-2" />
                <strong>سبب التعليق:</strong> {analytics.suspendedReason}
              </div>
            )}
            {analytics?.walletBalance > 0 && (
              <div className="rounded-lg bg-warning/10 p-4 text-sm text-warning">
                <p>
                  <strong>رصيد مستحق:</strong> {formatPrice(analytics.walletBalance)}
                </p>
                <p className="mt-1 text-xs">
                  يرجى تسوية الرصيد المستحق لإعادة تفعيل الحساب
                </p>
              </div>
            )}
          </div>
          <button
            onClick={() => navigate('/contact-support')}
            className="mt-6 btn-primary flex items-center gap-2"
          >
            التواصل مع الدعم
          </button>
        </div>
      </div>
    );
  }

  // Case 4: Not approved but not pending/rejected (fallback)
  if (registrationStatus !== 'approved') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
        <div className="text-center">
          <div className="mb-6 text-6xl">⚠️</div>
          <h2 className="mb-3 text-2xl font-bold text-warning">حالة الحساب غير معروفة</h2>
          <p className="text-textGray">
            يرجى التواصل مع فريق الدعم لمعرفة حالة حسابك.
          </p>
          <button
            onClick={() => navigate('/contact-support')}
            className="mt-6 btn-primary"
          >
            التواصل مع الدعم
          </button>
        </div>
      </div>
    );
  }

  // =====================================================
  // ========== APPROVED HANDYMAN DASHBOARD ==========
  // =====================================================

  return (
    <div>
      {/* Header */}
      <div className="mb-6 overflow-hidden rounded-3xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-neutral p-6 transition-all duration-300 hover:shadow-lg relative">
        {/* Subtle decorative background gradient */}
        <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
        
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-textDark">{greeting()}، {user?.name?.split(' ')[0]}</h1>
            <p className="text-sm text-textGray">
              لديك {orders.length} طلب{orders.length !== 1 ? 'ات' : ''} جديد{orders.length !== 1 ? 'ة' : ''} اليوم
            </p>
            {/* Status badge */}
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-tertiary/10 px-3 py-1 text-xs font-bold text-tertiary">
                <span className="h-2 w-2 rounded-full bg-tertiary"></span>
                حساب مفعل
              </span>
              {user?.verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-500">
                  <FaCheck size={10} />
                  موثق
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-xl overflow-hidden border-2 border-neutral shadow-sm bg-neutral/50 p-1">
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
              className="btn-outline flex items-center gap-2 text-sm py-2 bg-white hover:-translate-y-0.5 shadow-sm"
            >
              <FaEdit /> تعديل الملف الشخصي
            </button>
          </div>
        </div>
      </div>

      {/* Wallet Alert */}
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

      {/* Stats Cards */}
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
          <div key={title} className={`overflow-hidden rounded-2xl bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-neutral transition-all duration-300 hover:-translate-y-1 hover:shadow-lg relative`}>
            {/* Top border colored accent */}
            <div className={`absolute top-0 right-0 left-0 h-1 bg-gradient-to-l ${color.replace('border-', 'from-').replace('text-', 'from-')} to-transparent opacity-50`} />
            
            <div className="flex items-center gap-4 mb-4">
              <div className={`p-3 rounded-xl bg-neutral text-primary`}>
                <Icon size={24} />
              </div>
              <p className="text-sm font-semibold text-textGray">{title}</p>
            </div>
            
            <p className="text-3xl font-bold text-textDark mb-1">{value}</p>
            <p className="text-xs text-textGray bg-neutral inline-block px-2 py-1 rounded-md">{sub}</p>
          </div>
        ))}
      </div>

      {/* Orders Section */}
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
          <div className="card text-center py-8 text-textGray">
            <div className="text-4xl mb-3">📭</div>
            لا توجد طلبات واردة حالياً
          </div>
        ) : (
          <div className="space-y-3">
            {orders.slice(0, 5).map((order) => (
              <div key={order._id} className="rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-neutral flex flex-wrap items-center justify-between gap-4 transition-all hover:shadow-md">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <img
                      src={getDefaultAvatar(order.customerId?.name || 'عميل')}
                      alt=""
                      className="h-14 w-14 rounded-full border-2 border-white shadow-sm"
                    />
                    <div className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-green-500 border-2 border-white" />
                  </div>
                  <div>
                    <p className="font-bold text-textDark text-lg">{order.customerId?.name || 'عميل'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-md">{order.profession}</span>
                      <span className="text-xs text-textGray">• 2 كم بعيد</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Link
                    to={`/handyman/orders/${order._id}`}
                    className="flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl bg-tertiary px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-tertiary/90 hover:-translate-y-0.5 shadow-sm"
                  >
                    <FaCheck /> قبول
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleReject(order._id)}
                    className="flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl bg-red-50 text-emergency px-5 py-2.5 text-sm font-bold transition-all hover:bg-red-100"
                  >
                    <FaTimes /> رفض
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}