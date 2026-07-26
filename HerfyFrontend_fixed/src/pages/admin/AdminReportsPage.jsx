import { useEffect, useState } from 'react';
import { FaFlag, FaCheck, FaBan } from 'react-icons/fa';
import { adminService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { getDefaultAvatar } from '../../utils/helpers';

const STATUS_LABELS = {
  pending: 'قيد الانتظار',
  reviewing: 'قيد المراجعة',
  resolved: 'تم الحل',
  dismissed: 'مرفوض',
};

export default function AdminReportsPage() {
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
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">البلاغات وحل النزاعات</h1>
          <p className="text-sm text-textGray">بلاغات العملاء والحرفيين على الطلبات المتنازع عليها</p>
        </div>
        <div className="flex gap-2">
          {['pending', 'reviewing', 'resolved', 'dismissed', 'all'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                statusFilter === s ? 'bg-primary text-white' : 'border border-borderGray text-textGray'
              }`}
            >
              {s === 'all' ? 'الكل' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <LoadingSpinner />
        ) : reports.length === 0 ? (
          <p className="py-8 text-center text-textGray">لا توجد بلاغات</p>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div key={r._id} className="rounded-xl border border-borderGray p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <img src={getDefaultAvatar(r.reportedBy?.name)} alt="" className="h-10 w-10 rounded-full" />
                    <div>
                      <p className="font-bold text-textDark">
                        <FaFlag className="ms-1 inline text-emergency" /> {r.reportedBy?.name} أبلغ عن {r.against?.name}
                      </p>
                      <p className="text-xs text-textGray">
                        طلب #{String(r.orderId?._id || r.orderId).slice(-6)} · {new Date(r.createdAt).toLocaleString('ar-EG')}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-neutral px-3 py-1 text-xs">{STATUS_LABELS[r.status]}</span>
                </div>
                <p className="mt-3 text-sm"><span className="font-semibold">السبب: </span>{r.reason}</p>
                {r.description && <p className="mt-1 text-sm text-textGray">{r.description}</p>}
                {r.resolution && (
                  <p className="mt-2 rounded-lg bg-tertiary/10 p-2 text-sm text-tertiary">
                    <FaCheck className="ms-1 inline" /> تم الحل: {r.resolution}
                  </p>
                )}
                {(r.status === 'pending' || r.status === 'reviewing') && (
                  <button
                    type="button"
                    onClick={() => setActiveReport(r)}
                    className="mt-3 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white"
                  >
                    مراجعة وحل
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {activeReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-3 text-lg font-bold text-textDark">حل البلاغ</h3>
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => setAction('restore')}
                className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                  action === 'restore' ? 'bg-tertiary text-white' : 'border border-borderGray text-textGray'
                }`}
              >
                <FaCheck className="ms-1 inline" /> استئناف الطلب
              </button>
              <button
                type="button"
                onClick={() => setAction('cancel')}
                className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                  action === 'cancel' ? 'bg-emergency text-white' : 'border border-borderGray text-textGray'
                }`}
              >
                <FaBan className="ms-1 inline" /> إلغاء الطلب
              </button>
            </div>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={3}
              placeholder="اكتب قرار الحل..."
              className="input-field w-full resize-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setActiveReport(null)} className="btn-outline text-sm">
                إلغاء
              </button>
              <button
                type="button"
                disabled={!resolution.trim() || submitting}
                onClick={handleResolve}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? '...' : 'تأكيد الحل'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
