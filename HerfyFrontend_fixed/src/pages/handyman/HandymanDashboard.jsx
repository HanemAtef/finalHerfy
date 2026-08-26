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
  FaBan,
  FaHeadset,
  FaComments,
  FaExclamationTriangle,
  FaCheckCircle,
  FaArrowRight,
  FaMapMarkerAlt,
  FaCreditCard,
} from 'react-icons/fa';
import { getPendingOrders, updateOrderStatus } from '../../store/slices/orderSlice';
import { handymanService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import PendingReviewCard from '../../components/handyman/PendingReviewCard';
import MonthlyTargetBar from '../../components/handyman/MonthlyTargetBar';
import PenaltySettlementModal from '../../components/customer/PenaltySettlementModal';
import { formatPrice, getDefaultAvatar } from '../../utils/helpers';

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'صباح الخير' : 'مساء الخير';
};

export default function HandymanDashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const { orders, isLoading } = useSelector((state) => state.orders);
  const [available, setAvailable] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [registrationStatus, setRegistrationStatus] = useState(null);
  const [handymanData, setHandymanData] = useState(null);
  const [statusNote, setStatusNote] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [monthlyStats, setMonthlyStats] = useState(null);
  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const [locationErrorMsg, setLocationErrorMsg] = useState(null);
  const [requestingSettlement, setRequestingSettlement] = useState(false);
  const [settlementSuccessMsg, setSettlementSuccessMsg] = useState(null);
  const [settlementErrorMsg, setSettlementErrorMsg] = useState(null);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await handymanService.getStatus();
        
        if (res.data) {
          const status = res.data.status || res.data.data?.status || res.data.user?.registrationStatus;
          setRegistrationStatus(status);
          setStatusNote(res.data.msg || res.data.note || null);
          
          let handymanInfo = null;
          if (res.data.data) {
            handymanInfo = res.data.data;
          } else if (res.data.handyman) {
            handymanInfo = res.data.handyman;
          } else if (res.data.user) {
            handymanInfo = res.data.user;
          } else if (res.data.profession || res.data.specialization) {
            handymanInfo = res.data;
          }
          
          if (!handymanInfo) {
            handymanInfo = {
              ...user,
              profession: user?.profession || user?.specialization,
              address: user?.address || 'غير محدد',
              experienceYears: user?.experienceYears,
              price: user?.price || user?.hourlyRate,
            };
          }
          
          setHandymanData(handymanInfo);
          
          const savedHandymanData = localStorage.getItem('handymanRegistrationData');
          if (savedHandymanData) {
            try {
              const parsedData = JSON.parse(savedHandymanData);
              setHandymanData(prev => ({
                ...prev,
                ...parsedData,
                name: prev?.name || parsedData.name,
                email: prev?.email || parsedData.email,
              }));
            } catch (e) {
              console.error('Error parsing saved handyman data:', e);
            }
          }
          
          if (status === 'pending' || res.data.status === 'pending') {
            await fetchHandymanFullData();
          }
        }
      } catch (error) {
        console.error('[HandymanDashboard] status error:', error?.response?.data || error.message);
        
        const errorData = error?.response?.data;
        if (errorData) {
          if (errorData.status) {
            setRegistrationStatus(errorData.status);
            setStatusNote(errorData.msg || errorData.note || null);
          }
          if (errorData.data) {
            setHandymanData(errorData.data);
          } else if (errorData.user) {
            setHandymanData(errorData.user);
          }
        }
        
        if (user?.registrationStatus && !registrationStatus) {
          setRegistrationStatus(user.registrationStatus);
        }
        
        if (user && !handymanData) {
          const userData = {
            ...user,
            profession: user?.profession || user?.specialization || 'قيد التحديد',
            address: user?.address || 'قيد التحديد',
            experienceYears: user?.experienceYears || user?.experience || 0,
            price: user?.price || user?.hourlyRate || 0,
          };
          setHandymanData(userData);
        }

        const savedHandymanData = localStorage.getItem('handymanRegistrationData');
        if (savedHandymanData && !handymanData) {
          try {
            const parsedData = JSON.parse(savedHandymanData);
            setHandymanData(prev => ({
              ...prev,
              ...parsedData,
            }));
          } catch (e) {
            console.error('Error parsing saved handyman data:', e);
          }
        }

        if (user?.registrationStatus === 'pending' || errorData?.status === 'pending') {
          await fetchHandymanFullData();
        }
      } finally {
        setLoadingStatus(false);
      }
    };

    const fetchHandymanFullData = async () => {
      try {
        const profileRes = await handymanService.getHandymanProfile();
        if (profileRes.data) {
          const nextData = profileRes.data.handyman || profileRes.data.data || profileRes.data;
          setHandymanData(nextData);
        }
      } catch (error) {
        const savedData = localStorage.getItem('handymanRegistrationData');
        if (savedData) {
          try {
            const parsed = JSON.parse(savedData);
            setHandymanData(prev => ({
              ...prev,
              ...parsed,
            }));
          } catch (e) {
            console.error('Error parsing saved data:', e);
          }
        }
      }
    };

    checkStatus();
  }, [user]);

  useEffect(() => {
    if (user?._id && registrationStatus === 'approved') {
      dispatch(getPendingOrders(user._id));
      handymanService.getAnalytics(user._id).then((res) => setAnalytics(res.data)).catch(() => {});
      handymanService.getMonthlyStats().then((res) => {
        setMonthlyStats(res.data);
        if (res.data?.verified !== undefined) {
          setHandymanData(prev => prev ? { ...prev, verified: res.data.verified } : prev);
        }
      }).catch(() => {});
      handymanService
        .getById(user._id)
        .then((res) => {
          const isAvailable = res.data?.isAvailable ?? res.data?.handyman?.isAvailable;
          if (typeof isAvailable === 'boolean') setAvailable(isAvailable);
          if (res.data) {
            setHandymanData(prev => ({
              ...prev,
              ...res.data,
              address: res.data.address || prev?.address,
              city: res.data.city || prev?.city,
              area: res.data.area || prev?.area,
              location: res.data.location || prev?.location,
            }));
          }
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

  const handleUpdateLocation = () => {
    setLocationErrorMsg(null);
    if (!navigator.geolocation) {
      setLocationErrorMsg("المتصفح لا يدعم تحديد الموقع.");
      return;
    }
    
    setIsUpdatingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          let area = '';
          let city = '';
          let fullAddress = '';

          try {
            const geoRes = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1&accept-language=ar`
            );
            if (geoRes.ok) {
              const geoData = await geoRes.json();
              console.log('[ReverseGeocoding] Full Nominatim Response:', geoData);
              const addr = geoData.address || {};
              console.log('[ReverseGeocoding] Address Details:', addr);

              // Smart Area extraction with fallback
              area = 
                addr.neighbourhood || 
                addr.suburb || 
                addr.quarter || 
                addr.city_district || 
                addr.district || 
                addr.hamlet || 
                addr.borough || 
                addr.county || 
                '';

              // Smart City extraction with fallback
              city = 
                addr.city || 
                addr.town || 
                addr.village || 
                addr.municipality || 
                addr.state || 
                '';

              const road = addr.road || addr.street || addr.pedestrian || addr.footway || '';
              fullAddress = [road, area, city].filter(Boolean).join('، ') || geoData.display_name || '';
            }
          } catch (geoErr) {
            console.warn('Reverse geocoding error:', geoErr);
          }

          const res = await handymanService.updateProfile(user._id, {
            location: { type: "Point", coordinates: [longitude, latitude] },
            address: fullAddress || handymanData?.address || '',
            city: city || handymanData?.city || '',
            area: area || handymanData?.area || '',
          });

          if (res.data) {
            const updated = res.data.handyman || res.data;
            setHandymanData((prev) => ({
              ...prev,
              location: updated.location || { type: "Point", coordinates: [longitude, latitude] },
              address: updated.address || fullAddress || prev?.address || '',
              city: updated.city || city || prev?.city || '',
              area: updated.area || area || prev?.area || '',
            }));
          }
        } catch (error) {
          setLocationErrorMsg("فشل تحديث الموقع في الخادم. يرجى المحاولة مرة أخرى.");
        } finally {
          setIsUpdatingLocation(false);
        }
      },
      (error) => {
        setIsUpdatingLocation(false);
        if (error.code === error.PERMISSION_DENIED) {
          setLocationErrorMsg("تم رفض الوصول للموقع. يرجى تفعيل الصلاحية من إعدادات المتصفح.");
        } else {
          setLocationErrorMsg("حدث خطأ أثناء الحصول على إحداثيات موقعك.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleRequestFineSettlement = async () => {
    setRequestingSettlement(true);
    setSettlementSuccessMsg(null);
    setSettlementErrorMsg(null);
    try {
      const res = await handymanService.requestFineSettlement();
      setSettlementSuccessMsg(res.data.msg || 'تم إرسال طلب تسوية الغرامة بنجاح، وهو قيد المراجعة من الإدارة');
      if (user?._id) {
        const analyticsRes = await handymanService.getAnalytics(user._id);
        setAnalytics(analyticsRes.data);
      }
    } catch (err) {
      setSettlementErrorMsg(err.response?.data?.msg || 'فشل إرسال طلب التسوية');
    } finally {
      setRequestingSettlement(false);
    }
  };

  if (loadingStatus) {
    return <LoadingSpinner text="جاري التحقق من حالة حسابك..." />;
  }

  const isPending = registrationStatus === 'pending' || 
                    user?.registrationStatus === 'pending' ||
                    (user && !registrationStatus);

  if (isPending) {
    return <PendingReviewCard handymanData={handymanData} />;
  }

  if (registrationStatus === 'rejected') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
        <div className="card max-w-md text-center p-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-emergency/10 text-emergency">
            <FaBan size={30} />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-emergency">تم رفض طلب التسجيل</h2>
          <p className="mb-4 text-xs text-textGray leading-relaxed">
            نأسف لإبلاغك بأن طلب التسجيل الخاص بك كحرفي في منصة حرفي لم تتم الموافقة عليه من قبل الإدارة.
          </p>
          {statusNote && (
            <div className="mb-4 rounded-xl bg-emergency/5 border border-emergency/20 p-3 text-xs text-emergency font-medium text-right">
              <strong>سبب الرفض:</strong> {statusNote}
            </div>
          )}
          <button
            onClick={() => navigate('/')}
            className="btn-outline w-full text-xs py-2.5"
          >
            العودة للصفحة الرئيسية
          </button>
        </div>
      </div>
    );
  }

  if (analytics?.isSuspended) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
        <div className="card max-w-md text-center p-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-emergency/10 text-emergency">
            <FaBan size={30} />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-emergency">الحساب معلق مؤقتاً</h2>
          <p className="mb-4 text-xs text-textGray leading-relaxed">
            عذراً، حسابك معلق حالياً بسبب تجاوز نسبة الإلغاء أو وجود مستحقات مالية غير مسددة.
          </p>
          {analytics?.suspendedReason && (
            <div className="mb-4 rounded-xl bg-emergency/5 border border-emergency/20 p-3 text-xs text-emergency text-right">
              <strong>سبب التعليق:</strong> {analytics.suspendedReason}
            </div>
          )}
          <button
            onClick={() => navigate('/handyman/support')}
            className="btn-primary w-full text-xs py-2.5 flex items-center justify-center gap-2"
          >
            <FaHeadset />
            <span>التواصل مع الإدارة للدعم</span>
          </button>
        </div>
      </div>
    );
  }

  if (registrationStatus !== 'approved') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
        <div className="card max-w-md text-center p-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-secondary/10 text-secondary">
            <FaExclamationTriangle size={30} />
          </div>
          <h2 className="mb-2 text-xl font-bold text-textDark">حالة الحساب غير مؤكدة</h2>
          <p className="mb-4 text-xs text-textGray">
            يرجى التواصل مع فريق الدعم للتحقق من حالة تفعيل حسابك المهني.
          </p>
          <button
            onClick={() => navigate('/handyman/support')}
            className="btn-primary w-full text-xs py-2.5"
          >
            التواصل مع الدعم
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome & Status Bar Card */}
      <div className="card relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-extrabold text-textDark">
                {greeting()}، {user?.name?.split(' ')[0]}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-tertiary/10 px-2.5 py-0.5 text-[11px] font-bold text-tertiary">
                <span className="h-1.5 w-1.5 rounded-full bg-tertiary" />
                حساب مفعل
              </span>
              {(analytics?.verified || (handymanData?.verified && (analytics?.completedOrders ?? 0) >= 10 && (analytics?.rating ?? 0) >= 4.5)) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                  <FaCheckCircle size={10} /> موثق
                </span>
              )}
            </div>
            <p className="text-xs text-textGray">
              لديك <span className="font-bold text-textDark">{orders.length} طلبات جديدة</span> بانتظار ردك وتحديد السعر
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Availability Segmented Switch */}
            <div className="flex rounded-xl border border-borderGray bg-neutral p-1 shadow-2xs">
              <button
                type="button"
                onClick={() => handleAvailability(true)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  available ? 'bg-tertiary text-white shadow-sm' : 'text-textGray hover:text-textDark'
                }`}
              >
                متاح للعمل
              </button>
              <button
                type="button"
                onClick={() => handleAvailability(false)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  !available ? 'bg-textGray text-white shadow-sm' : 'text-textGray hover:text-textDark'
                }`}
              >
                مشغول
              </button>
            </div>

            <Link
              to="/handyman/support"
              className="btn-outline text-xs py-2 px-3.5"
            >
              <FaHeadset size={12} /> الدعم
            </Link>

            <button
              type="button"
              onClick={() => navigate('/handyman/profile')}
              className="btn-outline text-xs py-2 px-3.5"
            >
              <FaEdit size={12} /> تعديل الملف
            </button>
          </div>
        </div>
      </div>

      {/* Penalties Notice Banner */}
      {analytics && (analytics.penaltyAmount || 0) > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-r-4 border-r-emergency bg-emergency/5 border border-emergency/20 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emergency/10 text-emergency shrink-0">
              <FaExclamationTriangle size={20} />
            </div>
            <div>
              <p className="font-extrabold text-emergency text-sm">
                الغرامات المستحقة: <span className="text-base">{formatPrice(analytics.penaltyAmount)}</span>
                <span className="text-xs font-normal text-textDark mr-2">({analytics.penaltyCount || 0} مخالفات مسجلة تاريخياً)</span>
              </p>
              <p className="text-xs text-textDark mt-0.5">
                تفاصيل الغرامات: <span className="font-medium">غرامة إلغاء طلبات متكررة.</span>
                نسبة الإلغاء الحالية: <span className="font-bold text-emergency">{analytics.cancellationRate !== undefined ? `${analytics.cancellationRate}%` : '0%'}</span> ({analytics.cancelledOrders || 0} طلبات ملغاة).
                <span className="font-bold text-emergency mr-1">لا يمكنك قبول أي طلبات جديدة حتى سداد الغرامة بالكامل.</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPenaltyModal(true)}
              className="flex items-center gap-2 rounded-xl bg-emergency px-5 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-emergency/90 transition-all active:scale-95 shrink-0"
            >
              <FaCreditCard size={14} />
              دفع الغرامة بالبطاقة (Visa/Card)
            </button>
          </div>
        </div>
      )}

      {/* Wallet Balance Alerts */}
      {analytics?.walletBalance > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-r-4 border-r-secondary bg-secondary/5 border border-secondary/20 p-4">
          <div>
            <p className="font-bold text-textDark text-sm">
              عمولة المنصة المستحقة: <span className="font-extrabold text-secondary">{formatPrice(analytics.walletBalance)}</span>
            </p>
            <p className="text-xs text-textGray mt-0.5">
              نسبة عمولة المنصة عن الطلبات النقدية (الكاش) — يرجى تسويتها بانتظام.
            </p>
          </div>
        </div>
      )}

      {(analytics?.wallet?.pendingEarnings || analytics?.pendingEarnings) > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-r-4 border-r-tertiary bg-tertiary/5 border border-tertiary/20 p-4">
          <div>
            <p className="font-bold text-textDark text-sm">
              مستحقاتك من الدفع الإلكتروني: <span className="font-extrabold text-tertiary">{formatPrice(analytics?.wallet?.pendingEarnings || analytics?.pendingEarnings)}</span>
            </p>
            <p className="text-xs text-textGray mt-0.5">
              أرباحك المحصلة بالبطاقة جاهزة للتحويل لحسابك البنكي/المحفظة.
            </p>
          </div>
          <span className="badge-status bg-tertiary/20 text-tertiary text-xs font-bold">قيد التحويل</span>
        </div>
      )}

      {/* Base Location Section */}
      <div className="mb-6 rounded-2xl bg-white border border-neutral shadow-card p-5">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-neutral/60">
          <div className="flex items-center gap-2">
            <FaMapMarkerAlt className="text-primary" size={18} />
            <h3 className="font-bold text-textDark text-base">الموقع الأساسي للحرفي (Base Location)</h3>
          </div>
          <button
            onClick={handleUpdateLocation}
            disabled={isUpdatingLocation}
            className="text-xs bg-primary text-white px-4 py-2 rounded-xl hover:bg-primary/90 transition-all font-bold disabled:opacity-50 shadow-xs"
          >
            {isUpdatingLocation ? 'جاري تحديد وتحديث الموقع...' : 'تحديث الموقع'}
          </button>
        </div>
        {locationErrorMsg && (
          <div className="mb-3 text-xs text-emergency bg-emergency/10 p-2.5 rounded-xl font-bold border border-emergency/20">
            {locationErrorMsg}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-textGray leading-relaxed">
          <div className="space-y-1.5">
            <p>
              <strong className="text-textDark font-bold"> المنطقة: </strong> 
              <span className="text-textDark">{handymanData?.area || 'غير محددة'}</span>
            </p>
            <p>
              <strong className="text-textDark font-bold"> المدينة: </strong> 
              <span className="text-textDark">{handymanData?.city || 'غير محددة'}</span>
            </p>
            <p>
              <strong className="text-textDark font-bold"> العنوان: </strong> 
              <span className="text-textDark">{handymanData?.address || 'غير محدد'}</span>
            </p>
          </div>
          <div className="space-y-1.5">
            <p>
              <strong className="text-textDark font-bold"> الإحداثيات: </strong> 
              {handymanData?.location?.coordinates && handymanData.location.coordinates.length === 2 ? (
                <span className="font-mono text-primary font-bold">
                  {handymanData.location.coordinates[1].toFixed(5)}, {handymanData.location.coordinates[0].toFixed(5)}
                </span>
              ) : (
                <span className="text-textGray">غير محددة</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {monthlyStats && (
        <MonthlyTargetBar
          completed={monthlyStats.completedOrders || 0}
          target={10}
          isTrusted={handymanData?.verified}
        />
      )}

      {/* 4 Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Rating */}
        <div className="stat-card border-r-4 border-r-tertiary">
          <div className="flex items-center justify-between">
            <span className="stat-label">متوسط التقييم</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tertiary/10 text-tertiary">
              <FaStar size={16} />
            </div>
          </div>
          <p className="stat-value">{analytics ? (analytics.ratings?.average || 0).toFixed(1) : '—'}</p>
          <p className="text-xs text-textGray mt-1">بناءً على آراء العملاء</p>
        </div>

        {/* Total Earnings */}
        <div className="stat-card border-r-4 border-r-secondary">
          <div className="flex items-center justify-between">
            <span className="stat-label">إجمالي الأرباح</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
              <FaMoneyBillWave size={16} />
            </div>
          </div>
          <p className="stat-value">{analytics ? formatPrice(analytics.earnings?.total || 0) : '—'}</p>
          <p className="text-xs text-textGray mt-1">{analytics?.orders?.completed ?? 0} طلب مكتمل</p>
        </div>

        {/* Cancellation Rate */}
        <div className={`stat-card border-r-4 ${((analytics?.cancellationRate ?? 0) > 20) ? 'border-r-emergency' : 'border-r-amber-500'}`}>
          <div className="flex items-center justify-between">
            <span className="stat-label">نسبة الإلغاء</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <FaBan size={15} />
            </div>
          </div>
         
          <p className="stat-value">{analytics?.orders?.cancelled ?? 0} طلبات ملغاة </p>
        </div>

        {/* Penalty Amount */}
        <div className={`stat-card border-r-4 ${(analytics?.penaltyAmount || 0) > 0 ? 'border-r-emergency' : 'border-r-primary'}`}>
          <div className="flex items-center justify-between">
            <span className="stat-label">الغرامات المستحقة</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FaExclamationTriangle size={15} />
            </div>
          </div>
          <p className="stat-value text-emergency">{analytics ? formatPrice(analytics.penaltyAmount || 0) : '0 ج.م'}</p>
          <p className="text-xs text-textGray mt-1">{analytics?.penaltyCount ?? 0} مخالفات مسجلة</p>
        </div>
      </div>

      {/* Pending Reschedule Requests Banner */}
      {orders.some((o) => ['scheduled', 'price_confirmed'].includes(o.status) && o.rescheduleRequest?.status === 'pending' && o.rescheduleRequest?.requestedBy === 'customer') && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 shrink-0">
              <FaClipboardList size={18} />
            </div>
            <div>
              <p className="font-bold text-amber-800 text-sm">لديك طلب إعادة جدولة جديد من العميل</p>
              <p className="text-xs text-textDark mt-0.5">
                طلب العميل تغيير موعد الطلب. اضغط للاطلاع على الموعد المقترح والموافقة أو الرفض.
              </p>
            </div>
          </div>
          <Link
            to={`/handyman/orders/${orders.find((o) => ['scheduled', 'price_confirmed'].includes(o.status) && o.rescheduleRequest?.status === 'pending' && o.rescheduleRequest?.requestedBy === 'customer')?._id}`}
            className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white transition-all hover:bg-amber-700 shadow-sm"
          >
            عرض الطلب والموافقة
          </Link>
        </div>
      )}

      {/* Incoming Orders Section */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FaClipboardList size={14} />
            </div>
            <h2 className="font-bold text-textDark text-base">الطلبات الواردة والجديدة</h2>
          </div>
          <Link to="/handyman/orders" className="text-xs font-semibold text-primary hover:underline">
            عرض كل الطلبات ←
          </Link>
        </div>

        {isLoading ? (
          <LoadingSpinner text="جاري تحديث الطلبات الواردة..." />
        ) : orders.length === 0 ? (
          <div className="empty-state py-12">
            <div className="empty-state-icon">📭</div>
            <p className="empty-state-title">لا توجد طلبات جديدة حالياً</p>
            <p className="empty-state-desc">تأكد من تفعيل وضع "متاح للعمل" لتلقي طلبات العملاء القريبة منك</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.slice(0, 5).map((order) => (
              <div
                key={order._id}
                className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 rounded-2xl border border-neutral bg-white p-4 transition-all hover:border-primary/30 hover:shadow-sm"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative shrink-0">
                    <img
                      src={getDefaultAvatar(order.customerId?.name || 'عميل')}
                      alt=""
                      className="h-12 w-12 rounded-2xl object-cover border border-borderGray"
                    />
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-textDark text-sm truncate">{order.customerId?.name || 'عميل'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">{order.profession}</span>
                      <span className="text-[11px] text-textGray flex items-center gap-1">
                        <FaMapMarkerAlt size={10} /> قريب من موقعك
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 w-full sm:w-auto shrink-0">
                  <Link
                    to={`/handyman/orders/${order._id}`}
                    className="btn-primary flex-1 sm:flex-none text-xs py-2 px-4 shadow-sm"
                  >
                    <FaCheck size={11} /> قبول وتحديد السعر
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleReject(order._id)}
                    className="flex-1 sm:flex-none items-center justify-center gap-1 rounded-xl bg-red-50 text-emergency px-3.5 py-2 text-xs font-bold transition-all hover:bg-red-100"
                  >
                    <FaTimes size={11} /> رفض
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Penalty Settlement Modal */}
      {showPenaltyModal && (
        <PenaltySettlementModal
          penaltyAmount={analytics?.penaltyAmount || user?.penaltyAmount || 0}
          penaltyCount={analytics?.penaltyCount || user?.penaltyCount || 1}
          onClose={() => {
            setShowPenaltyModal(false);
            if (user?._id) {
              handymanService.getAnalytics(user._id).then((res) => setAnalytics(res.data)).catch(() => {});
            }
          }}
        />
      )}
    </div>
  );
}