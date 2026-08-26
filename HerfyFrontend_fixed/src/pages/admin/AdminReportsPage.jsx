import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaFlag, FaCheck, FaBan, FaArrowRight, FaTimes, FaUser } from 'react-icons/fa';
import { adminService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { getDefaultAvatar } from '../../utils/helpers';

const STATUS_LABELS = {
  pending: 'قيد الانتظار',
  reviewing: 'قيد المراجعة',
  resolved: 'تم الحل',
  dismissed: 'مرفوض',
};

const statusColors = {
  pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  reviewing: 'bg-blue-50 text-blue-700 border border-blue-200',
  resolved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  dismissed: 'bg-neutral text-textGray border border-borderGray',
};

export default function AdminReportsPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState(null);
  const [resolution, setResolution] = useState('');
  const [action, setAction] = useState('restore');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    adminService
      .getReports({ status: statusFilter === 'all' ? undefined : statusFilter })
      .then((res) => setReports(res.data.data || []))
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [statusFilter]);

  const handleResolve = async () => {
    if (!resolution.trim()) return;
    setSubmitting(true);
    try {
      await adminService.resolveReport(activeReport._id, { resolution: resolution.trim(), action });
      setActiveReport(null);
      setResolution('');
      load();
    } finally {
      setSubmitting(false);
    }
  };

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
            <h1 className="text-2xl font-extrabold text-textDark">البلاغات والنزاعات</h1>
            <p className="text-xs text-textGray mt-0.5">حل الخلافات بين العملاء والحرفيين واتخاذ القرارات الإدارية</p>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex gap-1.5 overflow-x-auto">
          {['pending', 'reviewing', 'resolved', 'dismissed', 'all'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                statusFilter === s
                  ? 'bg-primary text-white shadow-sm'
                  : 'border border-borderGray bg-white text-textGray hover:border-primary/40'
              }`}
            >
              {s === 'all' ? 'الكل' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Reports List */}
      <div className="card space-y-4">
        {loading ? (
          <LoadingSpinner text="جاري تحميل البلاغات..." />
        ) : reports.length === 0 ? (
          <div className="empty-state py-12">
            <div className="empty-state-icon">🚩</div>
            <p className="empty-state-title">لا توجد بلاغات في هذا التصنيف</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div key={r._id} className="rounded-2xl border border-neutral p-4 bg-white transition-all hover:shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-neutral/70">
                  <div className="flex items-center gap-3">
                    <img src={getDefaultAvatar(r.reportedBy?.name)} alt="" className="h-10 w-10 rounded-2xl object-cover border border-borderGray" />
                    <div>
                      <p className="font-bold text-sm text-textDark flex items-center gap-1.5">
                        <FaFlag className="text-emergency shrink-0" size={12} />
                        <span>{r.reportedBy?.name}</span>
                        <span className="text-textGray font-normal">أبلغ عن</span>
                        <span className="text-primary font-bold">{r.against?.name || 'مستخدم'}</span>
                      </p>
                      <p className="text-[11px] text-textGray mt-0.5">
                        طلب #{String(r.orderId?._id || r.orderId).slice(-6)} • {new Date(r.createdAt).toLocaleString('ar-EG')}
                      </p>
                    </div>
                  </div>
                  <span className={`badge-status text-[11px] font-bold ${statusColors[r.status] || ''}`}>
                    {STATUS_LABELS[r.status]}
                  </span>
                </div>

                <div className="pt-3 text-xs space-y-1.5">
                  <p><strong className="text-textDark">السبب الرئيسي: </strong><span className="text-emergency font-semibold">{r.reason}</span></p>
                  {r.description && <p className="text-textGray leading-relaxed">{r.description}</p>}
                  
                  {r.resolution && (
                    <div className="mt-2 rounded-xl bg-emerald-50 border border-emerald-200/60 p-3 text-xs text-emerald-800 flex items-start gap-2">
                      <FaCheck className="shrink-0 mt-0.5 text-tertiary" size={12} />
                      <div>
                        <strong className="block mb-0.5">قرار الحل الإداري:</strong>
                        <span className="leading-relaxed">{r.resolution}</span>
                      </div>
                    </div>
                  )}

                  {(r.status === 'pending' || r.status === 'reviewing') && (
                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setActiveReport(r)}
                        className="btn-primary text-xs py-2 px-4 shadow-sm"
                      >
                        مراجعة واتخاذ قرار الحل
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolution Modal */}
      {activeReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-neutral animate-slide-up">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral">
              <h3 className="text-base font-bold text-textDark">اتخاذ قرار لحل النزاع</h3>
              <button type="button" onClick={() => setActiveReport(null)} className="rounded-xl p-1 text-textGray hover:bg-neutral">
                <FaTimes size={15} />
              </button>
            </div>

            <p className="text-xs text-textGray mb-3">حدد الإجراء المناسب للطلب المتنازع عليه واكتب سبب القرار:</p>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                type="button"
                onClick={() => setAction('restore')}
                className={`rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  action === 'restore' ? 'bg-tertiary text-white shadow-sm' : 'border border-borderGray text-textGray hover:bg-neutral'
                }`}
              >
                <FaCheck size={11} /> استئناف الطلب
              </button>
              <button
                type="button"
                onClick={() => setAction('cancel')}
                className={`rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  action === 'cancel' ? 'bg-emergency text-white shadow-sm' : 'border border-borderGray text-textGray hover:bg-neutral'
                }`}
              >
                <FaBan size={11} /> إلغاء الطلب نهائياً
              </button>
            </div>

            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={3}
              placeholder="اكتب حيثيات وتفاصيل قرار الحل الإداري هنا..."
              className="input-field w-full resize-none text-xs mb-4"
              autoFocus
            />

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setActiveReport(null)} className="btn-outline text-xs py-2 px-4">
                إلغاء
              </button>
              <button
                type="button"
                disabled={!resolution.trim() || submitting}
                onClick={handleResolve}
                className="btn-primary text-xs py-2 px-5 disabled:opacity-50"
              >
                {submitting ? 'جارٍ التأكيد...' : 'تأكيد القرار'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
