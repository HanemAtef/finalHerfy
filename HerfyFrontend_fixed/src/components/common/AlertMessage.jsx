import { FaCheckCircle, FaExclamationCircle, FaInfoCircle } from 'react-icons/fa';

export default function AlertMessage({ type = 'error', message, className = '' }) {
  if (!message) return null;

  const styles = {
    error: 'bg-red-50 text-red-700 border-red-200',
    success: 'bg-green-50 text-green-700 border-green-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
  };

  const icons = {
    error: <FaExclamationCircle className="text-red-500 flex-shrink-0" size={18} />,
    success: <FaCheckCircle className="text-green-500 flex-shrink-0" size={18} />,
    info: <FaInfoCircle className="text-blue-500 flex-shrink-0" size={18} />,
  };

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-4 shadow-sm transition-all duration-300 animate-fade-in ${styles[type]} ${className}`}
    >
      <div className="mt-0.5">{icons[type]}</div>
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}
