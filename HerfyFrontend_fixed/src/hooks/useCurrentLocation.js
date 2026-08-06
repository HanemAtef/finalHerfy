import { useEffect, useState, useCallback, useRef } from 'react';

export default function useCurrentLocation() {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const watchIdRef = useRef(null);

  // FIX: كانت بتستخدم getCurrentPosition اللي بيجيب الموقع مرة واحدة بس
  // وبعدها الموقع مبيتحدثش تاني. استبدلناها بـ watchPosition عشان الموقع
  // يفضل يتحدث تلقائيًا كل ما المستخدم (الحرفي مثلاً) يتحرك.
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('المتصفح لا يدعم تحديد الموقع');
      return;
    }

    // لو فيه watcher شغال قبل كده، اقفله الأول عشان منفتحش أكتر من واحد
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setLoading(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position?.coords?.latitude;
        const lng = position?.coords?.longitude;
        if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
          setLocation({ latitude: lat, longitude: lng });
          setError(null);
        }
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLocation((prev) => prev ?? { latitude: 30.0444, longitude: 31.2357 });
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
    );
  }, []);

  useEffect(() => {
    requestLocation();

    // تنظيف الـ watcher عند الخروج من الصفحة/الكومبوننت
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [requestLocation]);

  return { location, error, loading, requestLocation };
}