import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { FaArrowRight, FaFlag, FaCheck } from 'react-icons/fa';
import { reportService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

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

export default function MyReportsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetReportId = searchParams.get('reportId');
  const { user } = useSelector((state) => state.auth);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportService
      .getMyReports()
      .then((res) => setReports(res.data.data || []))
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading && targetReportId && reports.length > 0) {
      const el = document.getElementById(`report-${targetReportId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [loading, targetReportId, reports]);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-borderGray text-primary hover:bg-neutral transition-colors shadow-sm"
          aria-label="رجوع"
        >
          <FaArrowRight size={13} />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-textDark">قائمة بلاغاتي والنزاعات</h1>
          <p className="text-xs text-textGray mt-0.5">متابعة الشكاوى والنزاعات المقدمة منك أو ضدك وقرارات الإدارة</p>
        </div>
      </div>

      <div className="card space-y-4">
        {loading ? (
          <LoadingSpinner text="جاري تحميل البلاغات..." />
        ) : reports.length === 0 ? (
          <div className="empty-state py-12">
            <div className="empty-state-icon">🚩</div>
            <p className="empty-state-title">لا توجد أي بلاغات مسجلة بحسابك</p>
            <p className="empty-state-desc">يمكنك فتح بلاغ على أي طلب نشط في حال حدوث خلاف من صفحة تفاصيل الطلب</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => {
              const filedByMe = (r.reportedBy?._id || r.reportedBy) === user?._id;
              const otherParty = filedByMe ? r.against : r.reportedBy;
              const isTargeted = targetReportId && r._id === targetReportId;
              return (
                <div
                  key={r._id}
                  id={`report-${r._id}`}
                  className={`rounded-2xl border p-4 transition duration-300 ${
                    isTargeted
                      ? 'border-primary ring-2 ring-primary/40 bg-primary/5 shadow-md'
                      : 'border-neutral bg-white hover:shadow-sm'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 pb-2 border-b border-neutral/70">
                    <div>
                      <p className="font-bold text-sm text-textDark flex items-center gap-1.5">
                        <FaFlag className="text-emergency" size={12} />
                        {filedByMe ? `بلّغت عن: ${otherParty?.name || 'الطرف الآخر'}` : `تم الإبلاغ عنك بواسطة: ${otherParty?.name || 'الطرف الآخر'}`}
                      </p>
                      <p className="text-[11px] text-textGray mt-0.5 font-mono">
                        طلب #{String(r.orderId?._id || r.orderId).slice(-6)} • {new Date(r.createdAt).toLocaleString('ar-EG')}
                      </p>
                    </div>
                    <span className={`badge-status text-[11px] font-bold ${statusColors[r.status] || ''}`}>
                      {STATUS_LABELS[r.status]}
                    </span>
                  </div>

                  <div className="pt-2.5 text-xs space-y-1.5">
                    <p><strong className="text-textDark">السبب: </strong><span className="text-emergency font-semibold">{r.reason}</span></p>
                    {r.description && <p className="text-textGray leading-relaxed">{r.description}</p>}
                    
                    {r.resolution && (
                      <div className="mt-2 rounded-xl bg-emerald-50 border border-emerald-200/60 p-3 text-xs text-emerald-800 flex items-start gap-2">
                        <FaCheck className="shrink-0 mt-0.5 text-tertiary" size={12} />
                        <div>
                          <strong className="block mb-0.5">قرار إدارة حرفي:</strong>
                          <span className="leading-relaxed">{r.resolution}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
