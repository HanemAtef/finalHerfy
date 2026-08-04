// HerfyFrontend_fixed/src/components/common/CancellationLimitBadge.jsx
// Shows "X من 3 إلغاءات متاحة هذا الشهر" — purely informational.

export default function CancellationLimitBadge({ used, limit = 3 }) {
  if (used == null) return null;
  const remaining = Math.max(0, limit - used);
  const isWarning = remaining === 1;
  const isExhausted = remaining === 0;

  const color = isExhausted
    ? 'bg-emergency/10 text-emergency border-emergency/20'
    : isWarning
    ? 'bg-[#FFF3E0] text-secondary border-secondary/20'
    : 'bg-neutral text-textGray border-borderGray';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${color}`}>
      <span className={`h-2 w-2 rounded-full ${isExhausted ? 'bg-emergency' : isWarning ? 'bg-secondary' : 'bg-textGray'}`} />
      {remaining} من {limit} إلغاءات متاحة هذا الشهر
    </span>
  );
}
