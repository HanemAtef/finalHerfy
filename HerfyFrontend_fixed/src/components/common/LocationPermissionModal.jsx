import { FaMapMarkerAlt, FaShieldAlt } from 'react-icons/fa';

export default function LocationPermissionModal({ onAllow, onDismiss }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        <div className="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-primary/5" />
          <div className="absolute inset-2 rounded-full bg-primary/10" />
          <FaMapMarkerAlt className="relative text-4xl text-primary" />
        </div>

        <h2 className="mb-3 text-xl font-bold text-primary">طلب إذن الموقع</h2>
        <p className="mb-6 text-sm text-textGray leading-relaxed">
          نحتاج موقعك الحالي لنظهر لك أقرب الحرفيين المتاحين في منطقتك لخدمتك بأسرع وقت.
        </p>

        <button type="button" onClick={onAllow} className="btn-primary mb-3 w-full flex items-center justify-center gap-2">
          <FaMapMarkerAlt /> السماح بالوصول إلى الموقع
        </button>
        <button type="button" onClick={onDismiss} className="text-sm text-textGray hover:text-primary">
          ليس الآن
        </button>

        <div className="mt-6 flex items-center justify-center gap-2 border-t border-borderGray pt-4 text-xs text-textGray">
          <FaShieldAlt className="text-primary" />
          بيانات موقعك محمية وتستخدم فقط لتحسين تجربتك
        </div>
      </div>
    </div>
  );
}
