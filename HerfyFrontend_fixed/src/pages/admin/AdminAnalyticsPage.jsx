import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaDownload, FaChartLine, FaUsers, FaBriefcase, FaStar, FaArrowRight } from 'react-icons/fa';
import { adminService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const STATUS_LABELS = {
  pending: 'قيد الانتظار', accepted: 'مقبول', price_confirmed: 'تم تأكيد السعر',
  'in-progress': 'قيد التنفيذ', completed: 'مكتمل', cancelled: 'ملغي', disputed: 'متنازع عليه',
};

export default function AdminAnalyticsPage() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [craftsmen, setCraftsmen] = useState([]);
  const [jobs, setJobs] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(null);

  useEffect(() => {
    Promise.all([
      adminService.getOverviewAnalytics(30),
      adminService.getCraftsmenAnalytics(),
      adminService.getJobsAnalytics(),
      adminService.getReviewsAnalytics(),
    ])
      .then(([o, c, j, r]) => {
        setOverview(o.data);
        setCraftsmen(c.data.data || []);
        setJobs(j.data);
        setReviews(r.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleExport = async (type) => {
    setExporting(type);
    try {
      await adminService.exportCSV(type);
    } finally {
      setExporting(null);
    }
  };

  if (loading) return <LoadingSpinner text="جاري إعداد التقارير والتحليلات..." />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-borderGray text-primary hover:bg-neutral transition-colors shadow-sm"
          >
            <FaArrowRight size={13} />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-textDark">التحليلات الشاملة</h1>
            <p className="text-xs text-textGray mt-0.5">مؤشرات الأداء خلال آخر 30 يوماً وتصدير التقارير</p>
          </div>
        </div>

        {/* Export Buttons */}
        <div className="flex gap-2">
          {['users', 'orders', 'reviews'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleExport(t)}
              disabled={exporting === t}
              className="btn-outline flex items-center gap-1.5 text-xs py-2 px-3 disabled:opacity-50"
            >
              <FaDownload size={11} /> {t === 'users' ? 'المستخدمين' : t === 'orders' ? 'الطلبات' : 'التقييمات'}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Stats Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { icon: FaUsers, label: 'مستخدمون جدد', value: overview?.newUsers ?? 0, border: 'border-r-primary', color: 'text-primary' },
          { icon: FaBriefcase, label: 'طلبات جديدة', value: overview?.newOrders ?? 0, border: 'border-r-secondary', color: 'text-secondary' },
          { icon: FaChartLine, label: 'إيراد العمولة المحققة', value: `${overview?.commissionRevenue?.toFixed(0) || 0} ج.م`, border: 'border-r-tertiary', color: 'text-tertiary' },
          { icon: FaStar, label: 'متوسط التقييم العام', value: reviews?.averageRating ? reviews.averageRating.toFixed(1) : '—', border: 'border-r-amber-500', color: 'text-amber-600' },
        ].map(({ icon: Icon, label, value, border, color }) => (
          <div key={label} className={`stat-card border-r-4 ${border}`}>
            <div className="flex items-center justify-between">
              <span className="stat-label">{label}</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral">
                <Icon className={color} size={15} />
              </div>
            </div>
            <p className={`stat-value mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Analytics Breakdown Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Orders by status */}
        <div className="card space-y-3">
          <h2 className="font-bold text-textDark text-sm pb-1 border-b border-neutral">الطلبات حسب الحالة</h2>
          <div className="space-y-2">
            {(overview?.ordersByStatus || []).map((s) => (
              <div key={s._id} className="flex items-center justify-between text-xs p-2 rounded-xl bg-neutral/40">
                <span className="font-medium text-textDark">{STATUS_LABELS[s._id] || s._id}</span>
                <span className="font-extrabold text-primary bg-white px-2.5 py-0.5 rounded-lg border border-neutral shadow-2xs">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Orders by Profession */}
        <div className="card space-y-3">
          <h2 className="font-bold text-textDark text-sm pb-1 border-b border-neutral">الطلبات حسب التخصص</h2>
          <div className="space-y-2">
            {(jobs?.byProfession || []).slice(0, 6).map((p) => (
              <div key={p._id} className="flex items-center justify-between text-xs p-2 rounded-xl bg-neutral/40">
                <span className="font-medium text-textDark">{p._id || '—'}</span>
                <span className="font-extrabold text-secondary bg-white px-2.5 py-0.5 rounded-lg border border-neutral shadow-2xs">{p.count}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-textGray pt-1">
            ⏱️ متوسط وقت إنجاز الطلب: <strong className="text-textDark">{jobs?.avgCompletionHours || 0} ساعة</strong>
          </p>
        </div>

        {/* Reviews Rating Distribution */}
        <div className="card space-y-3">
          <h2 className="font-bold text-textDark text-sm pb-1 border-b border-neutral">توزيع النجوم والتقييمات</h2>
          <div className="space-y-2.5">
            {(reviews?.distribution || []).map((d) => (
              <div key={d._id} className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-textDark">
                  <span className="text-secondary">{'★'.repeat(d._id)} ({d._id} نجوم)</span>
                  <span>{d.count} تقييم</span>
                </div>
                <div className="h-2 rounded-full bg-neutral">
                  <div
                    className="h-2 rounded-full bg-secondary"
                    style={{ width: `${reviews.total ? (d.count / reviews.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Craftsmen */}
        <div className="card space-y-3">
          <h2 className="font-bold text-textDark text-sm pb-1 border-b border-neutral">أعلى الحرفيين تقييماً</h2>
          <div className="space-y-2">
            {craftsmen.slice(0, 6).map((c) => (
              <div key={c.userId} className="flex items-center justify-between text-xs p-2 rounded-xl bg-neutral/40">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-textDark">{c.name}</span>
                  <span className="badge-status bg-primary/10 text-primary text-[10px] font-semibold">{c.profession}</span>
                </div>
                <span className="font-extrabold text-secondary">★ {c.rating?.toFixed?.(1) ?? c.rating}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
