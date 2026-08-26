import { useNavigate } from 'react-router-dom';
import { FaHourglassHalf, FaEnvelope, FaTools, FaMapMarkerAlt, FaMoneyBillWave, FaShieldAlt, FaArrowRight } from 'react-icons/fa';

const Row = ({ icon: Icon, label, value }) =>
  value && value !== '—' ? (
    <div className="flex items-center gap-3 py-3 border-b border-neutral/80 last:border-0">
      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-textGray">{label}</p>
        <p className="font-semibold text-textDark text-sm truncate">{value}</p>
      </div>
    </div>
  ) : null;

export default function PendingReviewCard({ handymanData }) {
  const navigate = useNavigate();

  const payload = handymanData?.handyman || handymanData?.data || handymanData || {};
  const userInfo = payload?.userId || payload?.user || payload?.userData || {};

  const name = payload?.name || userInfo?.name || payload?.user?.name || 'الحرفي';
  const email = payload?.email || userInfo?.email || payload?.user?.email || '';
  const profession = payload?.profession || payload?.specialization || userInfo?.profession || payload?.user?.profession || '—';
  const address = payload?.address || userInfo?.address || payload?.location?.address || payload?.user?.address || null;
  const experienceValue = payload?.experienceYears ?? payload?.experience ?? userInfo?.experienceYears ?? userInfo?.experience ?? null;
  const priceValue = payload?.price ?? payload?.hourlyRate ?? userInfo?.price ?? userInfo?.hourlyRate ?? null;
  const experience = experienceValue != null ? `${experienceValue} سنوات` : '—';
  const price = priceValue != null ? `${priceValue} ج.م` : '—';

  return (
    <div className="flex min-h-[75vh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-[var(--shadow-elevated)] border border-neutral overflow-hidden animate-slide-up">

        {/* Top accent bar */}
        <div className="h-1.5 bg-gradient-to-l from-secondary via-primary to-primary" />

        <div className="p-7">
          {/* Icon badge */}
          <div className="flex justify-center mb-5">
            <div className="w-20 h-20 rounded-3xl bg-secondary/10 flex items-center justify-center relative shadow-sm">
              <FaHourglassHalf size={34} className="text-secondary" />
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-5 w-5 bg-secondary border-2 border-white"></span>
              </span>
            </div>
          </div>

          {/* Heading */}
          <h2 className="text-center text-2xl font-bold text-textDark mb-1">
            طلبك قيد المراجعة
          </h2>
          
          {name && name !== '—' && (
            <p className="text-center text-sm text-primary font-semibold mb-2">
              أهلاً بك، {name}
            </p>
          )}

          <p className="text-center text-xs text-textGray leading-relaxed mb-5 max-w-xs mx-auto">
            شكراً لتسجيلك في منصة حرفي. يقوم فريق الإدارة بمراجعة وثائقك وبياناتك حالياً وسيتم تفعيل حسابك قريباً.
          </p>

          {/* Status badge */}
          <div className="flex justify-center mb-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-secondary/10 px-4 py-1.5 text-xs font-bold text-secondary border border-secondary/20">
              <span className="h-2 w-2 rounded-full bg-secondary animate-pulse" />
              بانتظار موافقة الإدارة
            </span>
          </div>

          <hr className="border-neutral mb-5" />

          {/* Data summary */}
          {profession !== '—' || address || experience !== '—' || price !== '—' ? (
            <div className="mb-5 bg-neutral/40 rounded-2xl p-4 border border-neutral">
              <h3 className="font-bold text-textDark mb-2 text-xs">ملخص البيانات المسجلة</h3>
              <div>
                {email && <Row icon={FaEnvelope} label="البريد الإلكتروني" value={email} />}
                <Row icon={FaTools} label="مجال التخصص" value={profession} />
                {address && <Row icon={FaMapMarkerAlt} label="العنوان" value={address} />}
                <Row icon={FaTools} label="سنوات الخبرة" value={experience} />
                <Row icon={FaMoneyBillWave} label="السعر بالساعة" value={price} />
              </div>
            </div>
          ) : null}

          {/* Info note */}
          <div className="bg-primary/5 border border-primary/15 rounded-2xl p-3.5 mb-6 flex items-start gap-2.5">
            <FaShieldAlt className="text-primary shrink-0 mt-0.5" size={16} />
            <p className="text-xs text-primary leading-relaxed">
              سيصلك إشعار فوري وتأكيد على بريدك الإلكتروني بمجرد اعتماد الحساب.
            </p>
          </div>

          {/* CTA button */}
          <button
            type="button"
            onClick={() => navigate('/')}
            className="btn-primary w-full text-sm py-3"
          >
            <FaArrowRight size={13} />
            العودة للصفحة الرئيسية
          </button>
        </div>
      </div>
    </div>
  );
}