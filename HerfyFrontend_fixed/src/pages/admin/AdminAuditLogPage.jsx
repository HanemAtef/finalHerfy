import { useEffect, useState } from 'react';
import { FaHistory } from 'react-icons/fa';
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
  'city.create': 'إضافة مدينة',
  'city.update': 'تعديل مدينة',
  'city.delete': 'حذف مدينة',
  'serviceType.create': 'إضافة تخصص',
  'serviceType.update': 'تعديل تخصص',
  'serviceType.delete': 'حذف تخصص',
};

export default function AdminAuditLogPage() {
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
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary">سجل النشاط الإداري</h1>
        <p className="text-sm text-textGray">كل إجراء يقوم به فريق الإدارة يُسجَّل هنا مع السبب</p>
      </div>

      <div className="card">
        {loading ? (
          <LoadingSpinner />
        ) : logs.length === 0 ? (
          <p className="py-8 text-center text-textGray">لا يوجد سجل بعد</p>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log._id} className="flex items-start gap-3 border-b border-borderGray pb-3 last:border-0">
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <FaHistory size={13} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-textDark">
                    {ACTION_LABELS[log.action] || log.action}
                    <span className="mx-1 text-textGray">بواسطة</span>
                    <span className="font-bold">{log.adminId?.name || 'أدمن'}</span>
                  </p>
                  {log.reason && <p className="text-xs text-textGray">السبب: {log.reason}</p>}
                  <p className="mt-0.5 text-xs text-textGray">{new Date(log.createdAt).toLocaleString('ar-EG')}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && pagination.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
              className="rounded-lg border border-borderGray px-3 py-1.5 disabled:opacity-50"
            >
              السابق
            </button>
            <span className="text-textGray">
              صفحة {pagination.page} من {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
              className="rounded-lg border border-borderGray px-3 py-1.5 disabled:opacity-50"
            >
              التالي
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
