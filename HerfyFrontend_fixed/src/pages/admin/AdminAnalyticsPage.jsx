import { useEffect, useState } from 'react';
import { FaDownload, FaChartLine, FaUsers, FaBriefcase, FaStar } from 'react-icons/fa';
import { adminService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const STATUS_LABELS = {
  pending: 'قيد الانتظار', accepted: 'مقبول', price_confirmed: 'تم تأكيد السعر',
  'in-progress': 'قيد التنفيذ', completed: 'مكتمل', cancelled: 'ملغي', disputed: 'متنازع عليه',
};

export default function AdminAnalyticsPage() {
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

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">التحليلات التفصيلية</h1>
          <p className="text-sm text-textGray">نظرة شاملة على أداء المنصة خلال آخر 30 يوماً</p>
        </div>
        <div className="flex gap-2">
          {['users', 'orders', 'reviews'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleExport(t)}
              disabled={exporting === t}
              className="btn-outline flex items-center gap-2 text-xs disabled:opacity-50"
            >
              <FaDownload /> {t === 'users' ? 'المستخدمون' : t === 'orders' ? 'الطلبات' : 'التقييمات'}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { icon: FaUsers, label: 'مستخدمون جدد', value: overview.newUsers, color: 'text-primary' },
          { icon: FaBriefcase, label: 'طلبات جديدة', value: overview.newOrders, color: 'text-secondary' },
          { icon: FaChartLine, label: 'إيراد العمولة', value: `${overview.commissionRevenue.toFixed(0)} ج.م`, color: 'text-tertiary' },
          { icon: FaStar, label: 'متوسط التقييم', value: reviews.averageRating || '—', color: 'text-secondary' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="card">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-neutral">
              <Icon className={color} size={18} />
            </div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-textGray">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-4 font-bold">الطلبات حسب الحالة</h3>
          {(overview.ordersByStatus || []).map((s) => (
            <div key={s._id} className="mb-2 flex items-center justify-between text-sm">
              <span>{STATUS_LABELS[s._id] || s._id}</span>
              <span className="font-bold">{s.count}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <h3 className="mb-4 font-bold">الطلبات حسب التخصص</h3>
          {(jobs.byProfession || []).slice(0, 6).map((p) => (
            <div key={p._id} className="mb-2 flex items-center justify-between text-sm">
              <span>{p._id || '—'}</span>
              <span className="font-bold">{p.count}</span>
            </div>
          ))}
          <p className="mt-3 text-xs text-textGray">متوسط وقت إنجاز الطلب: {jobs.avgCompletionHours} ساعة</p>
        </div>

        <div className="card">
          <h3 className="mb-4 font-bold">توزيع التقييمات</h3>
          {(reviews.distribution || []).map((d) => (
            <div key={d._id} className="mb-2">
              <div className="mb-1 flex justify-between text-sm">
                <span>{'★'.repeat(d._id)}</span>
                <span>{d.count}</span>
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

        <div className="card">
          <h3 className="mb-4 font-bold">أفضل الحرفيين</h3>
          <div className="space-y-2">
            {craftsmen.slice(0, 6).map((c) => (
              <div key={c.userId} className="flex items-center justify-between text-sm">
                <span>{c.name}</span>
                <span className="text-textGray">{c.profession}</span>
                <span className="font-bold text-secondary">★ {c.rating?.toFixed?.(1) ?? c.rating}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
