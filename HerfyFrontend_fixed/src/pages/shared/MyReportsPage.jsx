import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

// Shows the reports a customer/handyman filed (via the "الإبلاغ عن مشكلة"
// button in ChatPage) as well as any filed against them, with the admin's
// resolution once available. Filing happens in ChatPage; this is a
// read-only status view.
export default function MyReportsPage() {
  const navigate = useNavigate();
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

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="text-primary">
          <FaArrowRight size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-primary">بلاغاتي</h1>
          <p className="text-sm text-textGray">البلاغات التي قدّمتها أو المقدَّمة ضدك على الطلبات</p>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <LoadingSpinner />
        ) : reports.length === 0 ? (
          <p className="py-10 text-center text-textGray">
            <FaFlag className="mx-auto mb-2" size={22} /> لا توجد بلاغات
          </p>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => {
              const filedByMe = (r.reportedBy?._id || r.reportedBy) === user?._id;
              const otherParty = filedByMe ? r.against : r.reportedBy;
              return (
                <div key={r._id} className="rounded-xl border border-borderGray p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-textDark">
                        {filedByMe ? `بلّغت عن ${otherParty?.name || 'مستخدم'}` : `${otherParty?.name || 'مستخدم'} أبلغ عنك`}
                      </p>
                      <p className="text-xs text-textGray">
                        طلب #{String(r.orderId?._id || r.orderId).slice(-6)} · {new Date(r.createdAt).toLocaleString('ar-EG')}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        r.status === 'resolved' ? 'bg-tertiary/10 text-tertiary' : 'bg-secondary/10 text-secondary'
                      }`}
                    >
                      {STATUS_LABELS[r.status]}
                    </span>
                  </div>
                  <p className="mt-3 text-sm"><span className="font-semibold">السبب: </span>{r.reason}</p>
                  {r.resolution && (
                    <p className="mt-2 rounded-lg bg-tertiary/10 p-2 text-sm text-tertiary">
                      <FaCheck className="ms-1 inline" /> قرار الإدارة: {r.resolution}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
