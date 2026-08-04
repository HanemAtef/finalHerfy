// HerfyFrontend_fixed/src/components/handyman/MonthlyTargetBar.jsx
import { FaFire } from 'react-icons/fa';

export default function MonthlyTargetBar({ completed, target }) {
  const pct = target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0;
  const done = completed >= target;

  return (
    <div className="rounded-2xl bg-white border border-neutral shadow-card p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FaFire className={done ? 'text-secondary' : 'text-textGray'} />
          <span className="font-bold text-textDark text-sm">هدف الشهر</span>
        </div>
        <span className={`text-sm font-bold ${done ? 'text-tertiary' : 'text-textGray'}`}>
          {completed} من {target} طلبات هذا الشهر
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-3 rounded-full bg-neutral overflow-hidden">
        <div
          className={`h-3 rounded-full transition-all duration-500 ${done ? 'bg-tertiary' : 'bg-gradient-to-l from-secondary to-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-textGray">{pct}% مكتمل</span>
        {done ? (
          <span className="text-xs font-bold text-tertiary">🎉 أحسنت! حققت الهدف</span>
        ) : (
          <span className="text-xs text-textGray">{target - completed} طلب متبقي</span>
        )}
      </div>
    </div>
  );
}
