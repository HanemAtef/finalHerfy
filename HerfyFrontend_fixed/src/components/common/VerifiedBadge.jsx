import { FaCheckCircle } from 'react-icons/fa';

export default function VerifiedBadge({ className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-tertiary px-2 py-0.5 text-xs font-bold text-white ${className}`}
    >
      <FaCheckCircle size={10} />
      موثق
    </span>
  );
}
