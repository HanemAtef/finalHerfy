import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { FaLocationArrow, FaCheckCircle, FaTimes } from 'react-icons/fa';
import { getSocket } from '../socket/socket';
import { fetchOrderById, updateOrderStatus } from '../store/slices/orderSlice';
import useCurrentLocation from '../hooks/useCurrentLocation';
import LoadingSpinner from '../components/common/LoadingSpinner';

export default function HandymanTracking() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { currentOrder, isLoading } = useSelector((state) => state.orders);
  const { location } = useCurrentLocation();
  
  const [isTracking, setIsTracking] = useState(false);
  const [isArrived, setIsArrived] = useState(false);
  const intervalRef = useRef(null);
  const socketRef = useRef(null);

  // جلب تفاصيل الطلب
  useEffect(() => {
    dispatch(fetchOrderById(orderId));
  }, [dispatch, orderId]);

  // الاتصال بالـ Socket
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socketRef.current = socket;

    // استقبال تأكيد إرسال الموقع
    socket.on('locationSent', (data) => {
      console.log('✅ Location sent:', data);
    });

    socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });

    return () => {
      socket.off('locationSent');
      socket.off('error');
    };
  }, []);

  // بداية التتبع
  const startTracking = () => {
    if (!socketRef.current || !orderId) return;

    // إرسال إشارة بداية التتبع
    socketRef.current.emit('startTracking', orderId);
    setIsTracking(true);

    // إرسال الموقع فوراً
    if (location) {
      socketRef.current.emit('sendLocation', {
        orderId,
        lat: location.latitude,
        lng: location.longitude
      });
    }

    // بدأ إرسال الموقع كل 5 ثواني
    intervalRef.current = setInterval(() => {
      if (location) {
        socketRef.current.emit('sendLocation', {
          orderId,
          lat: location.latitude,
          lng: location.longitude
        });
      }
    }, 5000);
  };

  // نهاية التتبع (وصلت)
  const stopTracking = () => {
    if (!socketRef.current || !orderId) return;

    socketRef.current.emit('stopTracking', orderId);
    setIsTracking(false);
    setIsArrived(true);

    // إيقاف إرسال الموقع
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // تحديث حالة الطلب إلى in-progress
    dispatch(updateOrderStatus({ id: orderId, status: 'in-progress' }));
  };

  // تنظيف عند الخروج
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.off('locationSent');
        socketRef.current.off('error');
      }
    };
  }, []);

  if (isLoading) return <LoadingSpinner fullScreen />;
  if (!currentOrder) return <div>الطلب غير موجود</div>;

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="mx-auto max-w-md">
        <h1 className="mb-2 text-2xl font-bold text-primary">تتبع الطلب</h1>
        <p className="mb-6 text-sm text-textGray">
          رقم الطلب: #{String(orderId).slice(-6)}
        </p>

        {/* معلومات الطلب */}
        <div className="mb-6 rounded-xl bg-neutral p-4">
          <p className="text-sm text-textGray">الخدمة</p>
          <p className="font-bold text-textDark">{currentOrder.profession}</p>
          <p className="text-sm text-textGray">العميل</p>
          <p className="font-bold text-textDark">{currentOrder.customerId?.name || '—'}</p>
        </div>

        {/* موقعي الحالي */}
        <div className="mb-6 rounded-xl bg-primary/5 p-4">
          <p className="text-sm text-textGray">موقعك الحالي</p>
          {location ? (
            <p className="text-sm font-medium text-textDark">
              {location.latitude}, {location.longitude}
            </p>
          ) : (
            <p className="text-sm text-emergency">⏳ جاري جلب الموقع...</p>
          )}
        </div>

        {/* أزرار التحكم */}
        {!isTracking && !isArrived && (
          <button
            onClick={startTracking}
            disabled={!location}
            className="btn-primary flex w-full items-center justify-center gap-2 py-4 text-lg"
          >
            <FaLocationArrow />
            بدأت الطريق
          </button>
        )}

        {isTracking && (
          <div className="space-y-4">
            <div className="rounded-xl bg-tertiary/10 p-4 text-center">
              <p className="font-bold text-tertiary">📍 في الطريق إلى العميل</p>
              <p className="text-sm text-textGray">يتم إرسال موقعك كل 5 ثواني</p>
            </div>
            <button
              onClick={stopTracking}
              className="btn-secondary flex w-full items-center justify-center gap-2 py-4 text-lg"
            >
              <FaCheckCircle />
              وصلت ✅
            </button>
          </div>
        )}

        {isArrived && (
          <div className="rounded-xl bg-tertiary/10 p-4 text-center">
            <FaCheckCircle className="mx-auto text-4xl text-tertiary" />
            <p className="mt-2 font-bold text-tertiary">✅ تم الوصول بنجاح</p>
            <p className="text-sm text-textGray">يمكنك الآن بدء العمل</p>
            <button
              onClick={() => navigate(`/handyman/order/${orderId}`)}
              className="mt-4 btn-primary"
            >
              العودة للطلب
            </button>
          </div>
        )}
      </div>
    </div>
  );
}