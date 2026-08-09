  // HerfyFrontend_fixed/src/components/handyman/PendingReviewCard.jsx
  import { useNavigate } from 'react-router-dom';
  import { FaHourglassHalf, FaEnvelope, FaTools, FaMapMarkerAlt, FaMoneyBillWave } from 'react-icons/fa';

  const Row = ({ icon: Icon, label, value }) =>
    value && value !== '—' ? (
      <div className="flex items-center gap-3 py-3 border-b border-neutral last:border-0">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Icon size={16} />
        </div>
        <div className="flex-1">
          <p className="text-xs text-textGray">{label}</p>
          <p className="font-semibold text-textDark text-sm">{value}</p>
        </div>
      </div>
    ) : null;

  export default function PendingReviewCard({ handymanData }) {
    const navigate = useNavigate();

    // console.log('[PendingReviewCard] Received data:', handymanData);

    const payload = handymanData?.handyman || handymanData?.data || handymanData || {};
    const userInfo = payload?.userId || payload?.user || payload?.userData || {};

    // استخراج البيانات من عدة مصادر محتملة
    const name = payload?.name || userInfo?.name || payload?.user?.name || 'الحرفي';
    const email = payload?.email || userInfo?.email || payload?.user?.email || '';
    const profession = payload?.profession || payload?.specialization || userInfo?.profession || payload?.user?.profession || '—';
    const city = payload?.city || userInfo?.city || payload?.location?.city || payload?.user?.city || '—';
    const address = payload?.address || userInfo?.address || payload?.location?.address || payload?.user?.address || null;
    const experienceValue = payload?.experienceYears ?? payload?.experience ?? userInfo?.experienceYears ?? userInfo?.experience ?? null;
    const priceValue = payload?.price ?? payload?.hourlyRate ?? userInfo?.price ?? userInfo?.hourlyRate ?? null;
    const experience = experienceValue != null ? `${experienceValue} سنوات` : '—';
    const price = priceValue != null ? `${priceValue} ج.م` : '—';

    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.08)] border border-neutral overflow-hidden">

          {/* Top gradient strip */}
          <div className="h-1.5 bg-gradient-to-l from-secondary to-primary" />

          <div className="p-8">
            {/* Icon badge */}
            <div className="flex justify-center mb-5">
              <div className="w-20 h-20 rounded-full bg-[#FFF3E0] flex items-center justify-center shadow-sm relative">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10"></div>
                <FaHourglassHalf size={36} className="text-secondary relative z-10" />
              </div>
            </div>

            {/* Heading */}
            <h2 className="text-center text-2xl font-bold text-textDark mb-1">
              جاري مراجعة طلبك
            </h2>
            
            {/* User name */}
            {name && name !== '—' && (
              <p className="text-center text-sm text-primary font-semibold mb-2">
                مرحباً {name}
              </p>
            )}

            {/* Subtext */}
            <p className="text-center text-sm text-textGray leading-relaxed mb-5">
              شكراً لتسجيلك في منصة هرفي. فريقنا يراجع بياناتك حالياً وسيتم تفعيل حسابك في أقرب وقت ممكن.
            </p>

            {/* Status badge with animation */}
            <div className="flex justify-center mb-6">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#FFF3E0] px-4 py-1.5 text-sm font-bold text-secondary border border-secondary/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary"></span>
                </span>
                قيد المراجعة
              </span>
            </div>

            {/* Divider */}
            <hr className="border-neutral mb-5" />

            {/* Data summary */}
            {profession !== '—' || city !== '—' || address || experience !== '—' || price !== '—' ? (
              <>
                <h3 className="font-bold text-textDark mb-3 text-sm">ملخص البيانات المرسلة</h3>
                <div className="mb-5">
                  {email && <Row icon={FaEnvelope} label="البريد الإلكتروني" value={email} />}
                  <Row icon={FaTools} label="مجال التخصص" value={profession} />
                  <Row icon={FaMapMarkerAlt} label="المدينة" value={city} />
                  {address && <Row icon={FaMapMarkerAlt} label="الحي" value={address} />}
                  <Row icon={FaTools} label="سنوات الخبرة" value={experience} />
                  <Row icon={FaMoneyBillWave} label="نطاق السعر" value={price} />
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-textGray">جاري تحميل بياناتك...</p>
              </div>
            )}

            {/* Info note */}
            <div className="bg-blue-50 rounded-xl p-3 mb-6 flex items-start gap-2">
              <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <p className="text-xs text-blue-700 leading-relaxed">
                سيصلك إشعار عند قبول طلبك. مدة المراجعة 24-48 ساعة عمل.
              </p>
            </div>

            {/* CTA button */}
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="w-full py-3 rounded-xl font-bold text-white text-sm bg-gradient-to-l from-primary to-secondary hover:opacity-90 transition-all active:scale-[0.98] shadow-sm hover:shadow-md"
            >
              العودة للصفحة الرئيسية
            </button>
          </div>
        </div>
      </div>
    );
  }