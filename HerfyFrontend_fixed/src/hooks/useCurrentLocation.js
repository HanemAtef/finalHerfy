import { useEffect, useState, useCallback, useRef } from 'react';
import { isValidGpsCoord } from '../utils/routeValidation';

const CAIRO_FALLBACK = { latitude: 30.0444, longitude: 31.2357 };

const GPS_WATCH_OPTIONS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
const GPS_INIT_OPTIONS = { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 };

/**
 * @param {{ fallbackOnError?: boolean, tracking?: boolean }} options
 *   fallbackOnError=false — live tracking: location stays null on failure
 *   tracking=true — getCurrentPosition first, then watchPosition, with audit logs
 */
export default function useCurrentLocation(options = {}) {
  const { fallbackOnError = true, tracking = false } = options;
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const watchIdRef = useRef(null);
  const initialFixDoneRef = useRef(false);

  const applyValidPosition = useCallback((lat, lng) => {
    if (!isValidGpsCoord(lat, lng)) return false;
    setLocation({ latitude: lat, longitude: lng });
    setError(null);
    if (tracking) {
      console.log('✅ [CUSTOMER GPS] Valid location');
    }
    return true;
  }, [tracking]);

  const handleGeoError = useCallback(
    (err, context = 'GPS') => {
      if (err.code === 1) {
        console.error(`❌ [CUSTOMER GPS] Permission denied (${context})`);
      } else if (err.code === 2) {
        console.error(`❌ [CUSTOMER GPS] Position unavailable (${context})`);
      } else {
        console.error(`❌ [CUSTOMER GPS] Error (${context}):`, err.message);
      }
      setError(err.message);
      if (fallbackOnError) {
        setLocation((prev) => prev ?? CAIRO_FALLBACK);
      } else {
        setLocation(null);
      }
      setLoading(false);
    },
    [fallbackOnError]
  );

  const startWatch = useCallback(() => {
    if (watchIdRef.current !== null) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position?.coords?.latitude;
        const lng = position?.coords?.longitude;
        if (tracking && isValidGpsCoord(lat, lng)) {
          console.log('📍 [CUSTOMER GPS] watch update | latitude =', lat, '| longitude =', lng);
        }
        if (applyValidPosition(lat, lng)) {
          setLoading(false);
        }
      },
      (err) => handleGeoError(err, 'watchPosition'),
      GPS_WATCH_OPTIONS
    );
  }, [applyValidPosition, handleGeoError, tracking]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('المتصفح لا يدعم تحديد الموقع');
      setLocation(null);
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    initialFixDoneRef.current = false;
    setLoading(true);

    if (tracking) {
      console.log('📍 [CUSTOMER GPS] Requesting location...');
    }

    if (tracking) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          console.log('📍 [CUSTOMER GPS] Location received');
          console.log('📍 [CUSTOMER GPS] latitude =', lat);
          console.log('📍 [CUSTOMER GPS] longitude =', lng);
          initialFixDoneRef.current = true;
          applyValidPosition(lat, lng);
          setLoading(false);
          startWatch();
        },
        (err) => handleGeoError(err, 'getCurrentPosition'),
        GPS_INIT_OPTIONS
      );
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position?.coords?.latitude;
        const lng = position?.coords?.longitude;
        if (applyValidPosition(lat, lng)) {
          setLoading(false);
        }
      },
      (err) => handleGeoError(err, 'watchPosition'),
      GPS_WATCH_OPTIONS
    );
  }, [applyValidPosition, handleGeoError, startWatch, tracking]);

  useEffect(() => {
    requestLocation();

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [requestLocation]);

  return { location, error, loading, requestLocation };
};
