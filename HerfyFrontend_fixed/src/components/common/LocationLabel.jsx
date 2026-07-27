import { useEffect, useState } from 'react';
import { FaMapMarkerAlt } from 'react-icons/fa';
import { reverseGeocode } from '../../utils/geocode';

/**
 * Shows a resolved place name for a pair of coordinates instead of raw
 * "lat, lng" numbers. Never falls back to printing the coordinates — if
 * reverse geocoding fails, it shows a generic label instead.
 *
 * Usage: <LocationLabel lat={30.04} lng={31.23} />
 */
export default function LocationLabel({ lat, lng, icon = true, className = '', fallback = 'موقعك الحالي' }) {
  const [label, setLabel] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (lat == null || lng == null) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    reverseGeocode(lat, lng).then((result) => {
      if (!cancelled) {
        setLabel(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  const text = loading ? 'جاري تحديد الموقع...' : label || fallback;

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {icon && <FaMapMarkerAlt className="shrink-0 text-primary" />}
      {text}
    </span>
  );
}
