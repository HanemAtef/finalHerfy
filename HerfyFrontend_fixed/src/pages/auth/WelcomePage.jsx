import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaUser, FaHardHat, FaGlobe, FaShieldAlt, FaStar, FaClock } from 'react-icons/fa';

export default function WelcomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral flex flex-col justify-between">
      {/* Top Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-borderGray/60 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2.5 text-primary">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-white font-extrabold text-base shadow-md shadow-primary/20">
              ح
            </div>
            <span className="font-extrabold text-xl text-primary tracking-tight">
              Harfey <span className="text-secondary">(حرفي)</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="btn-outline text-xs sm:text-sm py-2 px-5"
          >
            تسجيل الدخول
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative mx-auto flex max-w-5xl flex-1 flex-col items-center justify-center px-4 py-10 sm:py-16">
        <div className="absolute inset-0 -z-10 opacity-30 bento-pattern pointer-events-none" />

        {/* Hero title */}
        <div className="mb-10 text-center animate-fade-in max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-1 text-xs font-bold text-primary mb-4">
            <FaStar size={11} className="text-secondary" /> المنصة الأولى للخدمات المنزلية المعتمدة
          </span>
          <h1 className="mb-3 text-3xl font-extrabold text-textDark sm:text-5xl leading-tight">
            أهلاً بك في <span className="text-primary">حرفي</span>
          </h1>
          <p className="mx-auto text-sm sm:text-base text-textGray leading-relaxed">
            المنصة الذكية الرائدة لربط أفضل الحرفيين والمهنيين بأصحاب المنازل في دقائق مع ضمان الجودة وتتبع الوصول المباشر.
          </p>
        </div>

        {/* Role Selection Cards */}
        <div className="grid w-full max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2 mb-12">
          {/* Customer Card */}
          <button
            type="button"
            onClick={() => navigate('/register?role=customer')}
            className="group relative flex flex-col items-center rounded-3xl border-2 border-transparent bg-white p-8 shadow-[var(--shadow-card)] transition-all duration-300 hover:border-primary hover:shadow-[var(--shadow-elevated)] hover:-translate-y-1 active:scale-[0.98] text-center"
          >
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110 shadow-sm">
              <FaUser size={34} />
            </div>
            <span className="inline-block rounded-full bg-primary/10 px-3 py-0.5 text-xs font-bold text-primary mb-2">أنا عميل</span>
            <h2 className="mb-2 text-2xl font-bold text-textDark">أبحث عن حرفي</h2>
            <p className="mb-6 text-xs text-textGray leading-relaxed">
              ابحث عن سباك، كهربائي، نجار أو أي فني صيانة لمنزلك مع تتبع الوصول والدفع الآمن.
            </p>
            <span className="mt-auto inline-flex items-center gap-2 text-sm font-bold text-primary group-hover:translate-x-[-4px] transition-transform">
              طلب خدمة فورية <FaArrowLeft size={12} />
            </span>
          </button>

          {/* Handyman Card */}
          <button
            type="button"
            onClick={() => navigate('/register?role=handyman')}
            className="group relative flex flex-col items-center rounded-3xl border-2 border-transparent bg-white p-8 shadow-[var(--shadow-card)] transition-all duration-300 hover:border-secondary hover:shadow-[var(--shadow-elevated)] hover:-translate-y-1 active:scale-[0.98] text-center"
          >
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-secondary/10 text-secondary transition-transform duration-300 group-hover:scale-110 shadow-sm">
              <FaHardHat size={34} />
            </div>
            <span className="inline-block rounded-full bg-secondary/10 px-3 py-0.5 text-xs font-bold text-secondary mb-2">أنا حرفي</span>
            <h2 className="mb-2 text-2xl font-bold text-textDark">أبحث عن شغل</h2>
            <p className="mb-6 text-xs text-textGray leading-relaxed">
              انضم كحرفي محترف، استقبل طلبات العملاء القريبة منك، وزد دخلك بعمولة عادلة.
            </p>
            <span className="mt-auto inline-flex items-center gap-2 text-sm font-bold text-secondary group-hover:translate-x-[-4px] transition-transform">
              الانضمام كحرفي <FaArrowLeft size={12} />
            </span>
          </button>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3 mb-10 text-center">
          <div className="rounded-2xl bg-white p-4 border border-neutral shadow-sm flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-tertiary/10 text-tertiary flex items-center justify-center shrink-0">
              <FaShieldAlt size={18} />
            </div>
            <div className="text-right">
              <p className="font-bold text-sm text-textDark">حرفيون موثقون</p>
              <p className="text-[11px] text-textGray">فحص كامل للهوية والخبرة</p>
            </div>
          </div>
          <div className="rounded-2xl bg-white p-4 border border-neutral shadow-sm flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
              <FaClock size={18} />
            </div>
            <div className="text-right">
              <p className="font-bold text-sm text-textDark">تتبع حي ومباشر</p>
              <p className="text-[11px] text-textGray">شاهد وصول الفني لحظة بلحظة</p>
            </div>
          </div>
          <div className="rounded-2xl bg-white p-4 border border-neutral shadow-sm flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <FaStar size={18} />
            </div>
            <div className="text-right">
              <p className="font-bold text-sm text-textDark">أسعار شفافة</p>
              <p className="text-[11px] text-textGray">سعر محدد بدون مفاجآت</p>
            </div>
          </div>
        </div>

        {/* Bottom CTA & Note */}
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="btn-primary text-sm py-3 px-10 rounded-xl"
          >
            <FaArrowLeft size={12} /> المتابعة لتسجيل الدخول
          </button>
          <p className="text-xs text-textGray">
            بالاستمرار، أنت توافق على{' '}
            <span className="font-semibold text-primary underline cursor-pointer">شروط الخدمة</span> و{' '}
            <span className="font-semibold text-primary underline cursor-pointer">سياسة الخصوصية</span>
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-borderGray/60 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row text-xs text-textGray">
          <div className="flex items-center gap-1.5 font-medium">
            <FaGlobe size={14} /> جمهورية مصر العربية
          </div>
          <div className="flex items-center gap-6">
            <span className="hover:text-primary cursor-pointer">عن المنصة</span>
            <span className="hover:text-primary cursor-pointer">مراكز الخدمة</span>
            <span className="hover:text-primary cursor-pointer">الدعم الفني</span>
          </div>
          <p className="text-textGray">جميع الحقوق محفوظة © Harfey 2026</p>
        </div>
      </footer>
    </div>
  );
}
