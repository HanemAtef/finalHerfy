import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaHistory, FaArrowRight, FaShieldAlt } from 'react-icons/fa';
import { adminService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const ACTION_LABELS = {
  'handyman.approve': 'الموافقة على حرفي',
  'handyman.reject': 'رفض حرفي',
  'handyman.suspend': 'تعليق حرفي',
  'handyman.unsuspend': 'إلغاء تعليق حرفي',
  'user.ban': 'حظر مستخدم',
  'user.unban': 'إلغاء حظر مستخدم',
  'user.delete': 'حذف حساب',
  'report.resolve': 'حل بلاغ',
  'penalty.settle': 'تسوية غرامة نقدية',
  'serviceType.create': 'إضافة تخصص',
  'serviceType.update': 'تعديل تخصص',
  'serviceType.delete': 'حذف تخصص',
};

export default function AdminAuditLogPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminService
      .getAuditLogs({ page: pagination.page, limit: 30 })
      .then((res) => {
        setLogs(res.data.data || []);
        setPagination((p) => ({ ...p, totalPages: res.data.pagination?.totalPages || 1 }));
      })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [pagination.page]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-borderGray text-primary hover:bg-neutral transition-colors shadow-sm"
        >
          <FaArrowRight size={13} />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-textDark">سجل العمليات الإدارية (Audit Log)</h1>
          <p className="text-xs text-textGray mt-0.5">توثيق شامل وتدقيق لكافة الإجراءات والقرارات المتخذة من مسؤولي النظام</p>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-neutral">
          <h2 className="font-bold text-textDark text-sm">سجل الأنشطة والقرارات</h2>
          <span className="text-xs text-textGray font-semibold bg-neutral px-2.5 py-0.5 rounded-full">{logs.length} عملية مسجلة</span>
        </div>

        {loading ? (
          <LoadingSpinner text="جاري تحميل سجل التدقيق..." />
        ) : logs.length === 0 ? (
          <div className="empty-state py-12">
            <div className="empty-state-icon">📋</div>
            <p className="empty-state-title">لا يوجد سجل أنشطة بعد</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log._id} className="flex items-start gap-3.5 rounded-2xl border border-neutral p-3.5 bg-neutral/30 transition hover:bg-neutral/60">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FaHistory size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-textDark">
                    {ACTION_LABELS[log.action] || log.action}
                    <span className="mx-1 text-textGray font-normal">بواسطة</span>
                    <span className="text-primary font-extrabold">{log.adminId?.name || 'مدير النظام'}</span>
                  </p>
                  {log.reason && (
                    <p className="text-xs text-textGray mt-1 bg-white p-2 rounded-xl border border-neutral">
                      <strong className="text-textDark">السبب المسجل:</strong> {log.reason}
                    </p>
                  )}
                  <p className="mt-1.5 text-[10px] text-textGray font-mono">{new Date(log.createdAt).toLocaleString('ar-EG')}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && pagination.totalPages > 1 && (
          <div className="pt-2 flex items-center justify-between text-xs text-textGray">
            <span>
              صفحة <strong className="text-textDark">{pagination.page}</strong> من <strong className="text-textDark">{pagination.totalPages}</strong>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                className="rounded-xl border border-borderGray px-3 py-1.5 font-bold text-textDark hover:bg-neutral disabled:opacity-40"
              >
                السابق
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                className="rounded-xl border border-borderGray px-3 py-1.5 font-bold text-textDark hover:bg-neutral disabled:opacity-40"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
