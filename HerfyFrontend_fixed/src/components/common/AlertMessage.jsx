import { FaCheckCircle, FaExclamationCircle, FaInfoCircle } from 'react-icons/fa';

export default function AlertMessage({ type = 'error', message, className = '' }) {
  if (!message) return null;

  const styles = {
    error: 'bg-red-50 text-red-800 border-red-200/80',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    info: 'bg-blue-50 text-blue-800 border-blue-200/80',
  };

  const icons = {
    error: <FaExclamationCircle className="text-emergency shrink-0 mt-0.5" size={17} />,
    success: <FaCheckCircle className="text-tertiary shrink-0 mt-0.5" size={17} />,
    info: <FaInfoCircle className="text-primary shrink-0 mt-0.5" size={17} />,
  };

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-3.5 shadow-sm transition-all duration-200 animate-fade-in ${styles[type]} ${className}`}
    >
      {icons[type]}
      <p className="text-sm font-medium leading-relaxed">{message}</p>
    </div>
  );
}
