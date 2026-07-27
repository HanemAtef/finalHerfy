import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaUser, FaHardHat, FaGlobe } from 'react-icons/fa';

export default function WelcomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral">
      <header className="flex h-16 items-center justify-center bg-white">
        <h1 className="text-2xl font-bold text-primary">Harfey (حرفي)</h1>
      </header>

      <main className="relative mx-auto flex max-w-5xl flex-col items-center px-4 py-12">
        <div className="absolute inset-0 -z-10 opacity-40 bento-pattern" />
        <div className="mb-8 text-center">
          <h2 className="mb-2 text-3xl font-bold text-primary md:text-4xl">أهلاً بك في حرفي</h2>
          <p className="mx-auto max-w-lg text-textGray">
            المنصة الرائدة لربط الخبراء الحرفيين بأصحاب المنازل. اختر كيف تود الانضمام إلينا اليوم.
          </p>
        </div>

        <div className="grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
          <button
            type="button"
            onClick={() => navigate('/register?role=customer')}
            className="group flex flex-col items-center rounded-xl border-2 border-transparent bg-white p-8 shadow-card transition-all hover:border-primary active:scale-[0.98]"
          >
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-110">
              <FaUser size={36} />
            </div>
            <h3 className="mb-3 text-xl font-bold text-primary">عميل</h3>
            <p className="mb-4 text-center text-sm text-textGray">
              أبحث عن حرفي ماهر للقيام بمهام الصيانة، السباكة، أو أي خدمات منزلية أخرى.
            </p>
            <span className="flex items-center gap-1 text-sm font-bold text-primary">
              أبحث عن حرفي <FaArrowLeft size={12} />
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/register?role=handyman')}
            className="group flex flex-col items-center rounded-xl border-2 border-transparent bg-white p-8 shadow-card transition-all hover:border-secondary active:scale-[0.98]"
          >
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-secondary/10 text-secondary transition-transform group-hover:scale-110">
              <FaHardHat size={36} />
            </div>
            <h3 className="mb-3 text-xl font-bold text-secondary">حرفي</h3>
            <p className="mb-4 text-center text-sm text-textGray">
              انضم كحرفي محترف وابحث عن فرص عمل جديدة وزِد دخلك من خلال منصتنا.
            </p>
            <span className="flex items-center gap-1 text-sm font-bold text-secondary">
              أبحث عن شغل <FaArrowLeft size={12} />
            </span>
          </button>
        </div>

        <div className="mt-10 grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
          <div className="relative h-48 overflow-hidden rounded-xl bg-secondary/20">
            <img
              src="https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=800&q=60"
              alt="راحة بال تامة"
              className="h-full w-full object-cover"
            />
            <span className="absolute bottom-3 right-3 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-textDark">
              راحة بال تامة
            </span>
          </div>
          <div className="relative h-48 overflow-hidden rounded-xl bg-primary/20">
            <img
              src="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=60"
              alt="نضمن الجودة والاتقان"
              className="h-full w-full object-cover"
            />
            <span className="absolute bottom-3 right-3 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-textDark">
              نضمن الجودة والاتقان
            </span>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="btn-primary flex items-center gap-2 px-12"
          >
            <FaArrowLeft /> متابعة
          </button>
          <p className="text-xs text-textGray">
            بالاستمرار، أنت توافق على{' '}
            <span className="font-semibold text-primary underline">شروط الخدمة</span> و{' '}
            <span className="font-semibold text-primary underline">سياسة الخصوصية</span>
          </p>
        </div>
      </main>

      <footer className="border-t border-borderGray bg-white px-6 py-5">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 md:flex-row">
          <div className="flex items-center gap-1.5 text-sm text-textGray">
            <FaGlobe /> العربية (SAR)
          </div>
          <div className="flex items-center gap-6 text-sm text-textGray">
            <span>عن المنصة</span>
            <span>مراكز الخدمة</span>
            <span>الدعم الفني</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white">
            <FaHardHat /> حرفي
          </div>
        </div>
      </footer>
    </div>
  );
}
