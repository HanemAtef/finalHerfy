import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FaUsers,
  FaHardHat,
  FaMoneyBillWave,
  FaShieldAlt,
  FaCheck,
  FaTimes,
  FaArrowRight,
  FaChartLine,
  FaExclamationTriangle,
  FaCreditCard,
} from 'react-icons/fa';
import { adminService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { getDefaultAvatar, formatPrice } from '../../utils/helpers';
import ReasonModal from '../../components/common/ReasonModal';

const ACTION_LABELS = {
  'handyman.approve': 'الموافقة على حرفي',
  'handyman.reject': 'رفض حرفي',
  'handyman.suspend': 'تعليق حرفي',
  'handyman.unsuspend': 'إلغاء تعليق حرفي',
  'handyman.autoVerify': 'توثيق تلقائي لحرفي',
  'user.ban': 'حظر مستخدم',
  'user.unban': 'إلغاء حظر مستخدم',
  'user.delete': 'حذف حساب',
  'report.resolve': 'حل بلاغ',
  'wallet.settle': 'تسوية محفظة',
  'penalty.settle': 'تسوية غرامة نقدية',
  'serviceType.create': 'إضافة تخصص',
  'serviceType.update': 'تعديل تخصص',
  'serviceType.delete': 'حذف تخصص',
};

function timeAgo(dateString) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.round(hours / 24);
  return `منذ ${days} يوم`;
}

function GrowthChart({ data }) {
  const width = 640;
  const height = 220;
  const padLeft = 36;
  const padRight = 16;
  const padTop = 14;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxValue = Math.max(1, ...data.map((d) => Math.max(d.users, d.orders)));
  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;

  const pointsFor = (key) =>
    data
      .map((d, i) => {
        const x = padLeft + i * stepX;
        const y = padTop + plotH - (d[key] / maxValue) * plotH;
        return `${x},${y}`;
      })
      .join(' ');

  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full">
        {gridSteps.map((g) => {
          const y = padTop + plotH - g * plotH;
          return (
            <g key={g}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#E5E7EB" strokeWidth="1" strokeDasharray="3 3" />
              <text x={padLeft - 6} y={y + 3} fontSize="9" fill="#9CA3AF" textAnchor="end">
                {Math.round(g * maxValue)}
              </text>
            </g>
          );
        })}
        <polyline points={pointsFor('orders')} fill="none" stroke="#F68B1E" strokeWidth="2.5" strokeLinecap="round" />
        <polyline points={pointsFor('users')} fill="none" stroke="#0F4C75" strokeWidth="2.5" strokeLinecap="round" />
        {data.map((d, i) => {
          const x = padLeft + i * stepX;
          const yUsers = padTop + plotH - (d.users / maxValue) * plotH;
          const yOrders = padTop + plotH - (d.orders / maxValue) * plotH;
          return (
            <g key={d.month}>
              <circle cx={x} cy={yUsers} r="3" fill="#0F4C75" />
              <circle cx={x} cy={yOrders} r="3" fill="#F68B1E" />
              <text x={x} y={height - 6} fontSize="9" fill="#6B7280" textAnchor="middle" fontWeight="bold">
                {d.month}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-3 flex items-center justify-center gap-6 text-xs text-textGray">
        <span className="flex items-center gap-1.5 font-medium"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> مستخدمون جدد</span>
        <span className="flex items-center gap-1.5 font-medium"><span className="h-2.5 w-2.5 rounded-full bg-secondary" /> طلبات جديدة</span>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [finePayments, setFinePayments] = useState([]);
  const [chart, setChart] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState(null);

  const loadData = async () => {
    try {
      const [statsRes, pendingRes, finePaymentsRes, chartRes, logsRes] = await Promise.all([
        adminService.getStats(),
        adminService.getPendingVerification(),
        adminService.getFinePayments(),
        adminService.getDashboardChart(),
        adminService.getAuditLogs({ page: 1, limit: 5 }),
      ]);
      setStats(statsRes.data);
      setPending((pendingRes.data.data || pendingRes.data || []).slice(0, 5));
      setFinePayments(finePaymentsRes.data.data || []);
      setChart(chartRes.data?.data || []);
      setActivities(logsRes.data?.data || []);
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApprove = async (id) => {
    try {
      await adminService.approveHandyman(id, { note: 'تمت الموافقة على الحساب' });
      setPending((prev) => prev.filter((p) => p._id !== id && p.handymanId !== id && p.userId !== id));
      const statsRes = await adminService.getStats();
      setStats(statsRes.data);
    } catch (err) {
      alert(err.response?.data?.msg || 'فشلت الموافقة على الطلب');
    }
  };

  const handleRejectConfirm = async (reason) => {
    if (!rejectModal) return;
    try {
      await adminService.rejectHandyman(rejectModal.id, { reason });
      setPending((prev) => prev.filter((p) => p._id !== rejectModal.id && p.handymanId !== rejectModal.id && p.userId !== rejectModal.id));
      setRejectModal(null);
    } catch (err) {
      alert(err.response?.data?.msg || 'فشل رفض الطلب');
    }
  };

  const handleConfirmSettlement = async (id) => {
    if (!window.confirm('تأكيد استلام المبلغ نقداً وتسوية الغرامة؟ سيتم إضافة المبلغ إلى إيرادات المنصة.')) return;
    try {
      await adminService.confirmSettlementRequest(id);
      loadData();
    } catch (err) {
      alert(err.response?.data?.msg || 'فشل تأكيد استلام المبلغ');
    }
  };

  const handleRejectSettlement = async (id) => {
    const reason = window.prompt('يرجى كتابة سبب رفض طلب تسوية الغرامة:', 'لم يتم استلام المبلغ نقداً');
    if (reason === null) return;
    try {
      await adminService.rejectSettlementRequest(id, { reason });
      loadData();
    } catch (err) {
      alert(err.response?.data?.msg || 'فشل رفض طلب التسوية');
    }
  };

  if (loading) return <LoadingSpinner text="جاري تحميل لوحة التحكم..." />;

  const statCards = [
    {
      icon: FaShieldAlt,
      label: 'طلبات التسجيل المعلقة',
      value: pending.length,
      urgent: pending.length > 0,
      color: 'border-r-secondary',
      onClick: () => navigate('/admin/verifications'),
    },
    {
      icon: FaMoneyBillWave,
      label: 'إجمالي الإيرادات',
      value: `${stats?.totalRevenue?.toLocaleString('ar-EG') || '0'} ج.م`,
      color: 'border-r-tertiary',
      onClick: () => navigate('/admin/analytics'),
    },
    {
      icon: FaHardHat,
      label: 'الحرفيون النشطون',
      value: stats?.totalHandymen?.toLocaleString('ar-EG') || '0',
      color: 'border-r-primary',
      onClick: () => navigate('/admin/users?role=handyman'),
    },
    {
      icon: FaUsers,
      label: 'إجمالي المستخدمين',
      value: stats?.totalUsers?.toLocaleString('ar-EG') || '0',
      color: 'border-r-blue-500',
      onClick: () => navigate('/admin/users'),
    },
  ];

  const hasChartData = chart.some((c) => c.users > 0 || c.orders > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-textDark">لوحة التحكم الرئيسية</h1>
        <p className="text-xs text-textGray mt-0.5">نظرة عامة ومؤشرات أداء منصة حرفي</p>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ icon: Icon, label, value, urgent, color, onClick }) => (
          <button
            type="button"
            key={label}
            onClick={onClick}
            className={`stat-card text-right transition-all hover:shadow-md hover:-translate-y-0.5 border-r-4 ${color}`}
          >
            <div className="flex items-center justify-between">
              <span className="stat-label">{label}</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral text-primary">
                <Icon size={16} />
              </div>
            </div>
            <div className="flex items-center justify-between mt-1">
              <p className="stat-value">{value}</p>
              {urgent && (
                <span className="rounded-full bg-emergency/10 px-2 py-0.5 text-[11px] font-extrabold text-emergency border border-emergency/20 animate-pulse">
                  عاجل
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Chart and Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Growth Chart */}
        <div className="card lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-neutral">
            <div>
              <h2 className="font-bold text-textDark text-sm">معدل نمو المنصة</h2>
              <p className="text-[11px] text-textGray">المستخدمون والطلبات المسجلة خلال العام</p>
            </div>
            <span className="rounded-xl border border-borderGray bg-neutral px-3 py-1 text-xs font-semibold text-textDark">
              {new Date().getFullYear()}
            </span>
          </div>
          {!hasChartData ? (
            <p className="py-12 text-center text-xs text-textGray">لا توجد بيانات كافية لعرض الرسم البياني</p>
          ) : (
            <GrowthChart data={chart} />
          )}
        </div>

        {/* Recent Activities */}
        <div className="card space-y-3">
          <h2 className="font-bold text-textDark text-sm pb-2 border-b border-neutral">آخر الأنشطة الإدارية</h2>
          {activities.length === 0 ? (
            <p className="py-8 text-center text-xs text-textGray">لا توجد نشاطات مسجلة مؤخراً</p>
          ) : (
            <div className="space-y-2.5">
              {activities.map((log) => (
                <div key={log._id} className="flex items-start gap-2.5 text-xs pb-2 border-b border-neutral/60 last:border-0">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-textDark truncate">{ACTION_LABELS[log.action] || log.action}</p>
                    <p className="text-[10px] text-textGray mt-0.5">{timeAgo(log.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pending Registration Requests Table */}
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-neutral">
          <div>
            <h2 className="font-bold text-textDark text-sm">طلبات تسجيل الحرفيين المعلقة</h2>
            <p className="text-xs text-textGray mt-0.5">الحرفيون الجدد بانتظار فحص المستندات والموافقة</p>
          </div>
          <Link to="/admin/verifications" className="text-xs font-bold text-primary hover:underline">
            عرض كافة طلبات التوثيق ←
          </Link>
        </div>

        {pending.length === 0 ? (
          <div className="py-8 text-center text-xs text-textGray">لا توجد طلبات تسجيل معلقة حالياً ✓</div>
        ) : (
          <div className="table-wrapper">
            <table className="table-base">
              <thead className="table-head">
                <tr>
                  <th className="table-th">الاسم</th>
                  <th className="table-th">البريد الإلكتروني</th>
                  <th className="table-th">الهاتف</th>
                  <th className="table-th">المهنة</th>
                  <th className="table-th">التاريخ</th>
                  <th className="table-th">الحالة</th>
                  <th className="table-th text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((item) => {
                  const id = item._id || item.handymanId || item.userId;
                  const name = item.name || item.userId?.name || '—';
                  const email = item.email || item.userId?.email || '—';
                  const phone = item.phone || item.userId?.phone || '—';
                  const profession = item.profession || '—';
                  const date = item.createdAt || item.registeredAt ? new Date(item.createdAt || item.registeredAt).toLocaleDateString('ar-EG') : '—';
                  const status = item.status || item.registrationStatus || 'pending';

                  return (
                    <tr key={id} className="table-tr">
                      <td className="table-td">
                        <div className="flex items-center gap-2">
                          <img src={getDefaultAvatar(name)} alt="" className="h-7 w-7 rounded-full" />
                          <span className="font-bold text-xs text-textDark">{name}</span>
                        </div>
                      </td>
                      <td className="table-td text-xs text-textGray">{email}</td>
                      <td className="table-td text-xs text-textDark font-mono" dir="ltr">{phone}</td>
                      <td className="table-td">
                        <span className="badge-status bg-primary/10 text-primary font-bold text-[11px]">
                          {profession}
                        </span>
                      </td>
                      <td className="table-td text-xs text-textGray">{date}</td>
                      <td className="table-td">
                        <span className="badge-status bg-secondary/15 text-secondary font-bold text-[11px]">
                          {status === 'pending' ? 'قيد المراجعة' : status}
                        </span>
                      </td>
                      <td className="table-td">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleApprove(id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-tertiary px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:opacity-90 transition"
                            title="قبول"
                          >
                            <FaCheck size={10} /> قبول
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectModal({ id, name })}
                            className="inline-flex items-center gap-1 rounded-lg bg-emergency px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:opacity-90 transition"
                            title="رفض"
                          >
                            <FaTimes size={10} /> رفض
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Fine Payments (Card / Stripe) Table */}
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-neutral">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-tertiary/10 text-tertiary">
              <FaCreditCard size={14} />
            </div>
            <div>
              <h2 className="font-bold text-textDark text-sm">سجل سداد الغرامات الإلكتروني (Card Payments)</h2>
              <p className="text-xs text-textGray mt-0.5">عمليات سداد الغرامات المحصلة إلكترونياً بالبطاقة عبر Stripe والمضافة لإيرادات المنصة</p>
            </div>
          </div>
          {finePayments.length > 0 && (
            <span className="badge-status bg-tertiary/15 text-tertiary font-bold text-xs">
              {finePayments.length} عملية سداد ناجحة
            </span>
          )}
        </div>

        {finePayments.length === 0 ? (
          <div className="py-8 text-center text-xs text-textGray">لا توجد عمليات سداد غرامات بالبطاقة حتى الآن ✓</div>
        ) : (
          <div className="table-wrapper">
            <table className="table-base">
              <thead className="table-head">
                <tr>
                  <th className="table-th">اسم الحرفي</th>
                  <th className="table-th">Handyman ID</th>
                  <th className="table-th">قيمة الغرامة</th>
                  <th className="table-th">معرف المعاملة (Transaction ID)</th>
                  <th className="table-th">طريقة الدفع</th>
                  <th className="table-th">تاريخ السداد</th>
                  <th className="table-th">حالة الدفع</th>
                </tr>
              </thead>
              <tbody>
                {finePayments.map((record) => {
                  const id = record._id;
                  const handymanName = record.handymanId?.name || '—';
                  const handymanUserId = record.handymanId?._id || record.handymanId || '—';
                  const amount = record.amount || 0;
                  const transactionId = record.transactionId || record._id;
                  const date = record.createdAt ? new Date(record.createdAt).toLocaleDateString('ar-EG') : '—';

                  return (
                    <tr key={id} className="table-tr">
                      <td className="table-td">
                        <div className="flex items-center gap-2">
                          <img src={getDefaultAvatar(handymanName)} alt="" className="h-7 w-7 rounded-full" />
                          <span className="font-bold text-xs text-textDark">{handymanName}</span>
                        </div>
                      </td>
                      <td className="table-td text-xs text-textGray font-mono" title={handymanUserId}>
                        {typeof handymanUserId === 'string' ? handymanUserId.slice(-6) : handymanUserId}
                      </td>
                      <td className="table-td font-extrabold text-xs text-tertiary">
                        {formatPrice(amount)}
                      </td>
                      <td className="table-td text-xs text-textDark font-mono" title={transactionId}>
                        {typeof transactionId === 'string' ? transactionId.slice(-12) : transactionId}
                      </td>
                      <td className="table-td text-xs text-textDark">
                        <span className="inline-flex items-center gap-1 font-bold text-primary">
                          <FaCreditCard size={11} /> بطاقة بنكية (Visa/Mastercard)
                        </span>
                      </td>
                      <td className="table-td text-xs text-textGray">{date}</td>
                      <td className="table-td">
                        <span className="badge-status text-[11px] font-bold bg-tertiary/15 text-tertiary">
                          تم الدفع وإيداع الإيراد ✓
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rejectModal && (
        <ReasonModal
          title={`سبب رفض طلب تسجيل: ${rejectModal.name}`}
          confirmLabel="رفض الطلب"
          danger
          onConfirm={handleRejectConfirm}
          onClose={() => setRejectModal(null)}
        />
      )}
    </div>
  );
}
