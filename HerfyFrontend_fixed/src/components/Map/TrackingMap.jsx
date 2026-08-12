import { useRef, useEffect, useState, useMemo } from 'react';
import tt from '@tomtom-international/web-sdk-maps';
import '@tomtom-international/web-sdk-maps/dist/maps.css';
import {
  isValidGpsCoord,
  sanitizeRouteCoords,
  getDirectDistanceMeters,
  isGeometryConsistent,
} from '../../utils/routeValidation';
import { devGroup } from '../../utils/devLog';

/** Returns [lng, lat] or null — never pass null/NaN to TomTom APIs */
const toLngLat = (location) => {
  if (!location) return null;
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  if (!isValidGpsCoord(lat, lng)) return null;
  return [lng, lat];
};

const isFiniteLngLat = (lngLat) =>
  Array.isArray(lngLat) &&
  lngLat.length === 2 &&
  Number.isFinite(lngLat[0]) &&
  Number.isFinite(lngLat[1]);

const safeZoom = (value, fallback = 13) => {
  const z = Number(value);
  return Number.isFinite(z) ? z : fallback;
};

const logContainerSize = (mapRef, label = '') => {
  const el = mapRef.current;
  if (!el) {
    console.log('[TOMTOM DEBUG] container size = null (ref not attached)', label);
    return { width: 0, height: 0 };
  }
  const rect = el.getBoundingClientRect();
  const size = { width: rect.width, height: rect.height };
  console.log('[TOMTOM DEBUG] container size =', size, label);
  return size;
};

const tomTomCall = (operation, fn) => {
  try {
    console.log(`[TOMTOM DEBUG] ${operation} START`);
    const result = fn();
    console.log(`[TOMTOM DEBUG] ${operation} SUCCESS`);
    return result;
  } catch (err) {
    console.error(`[TOMTOM ERROR] ${operation}`, err);
    if (err?.stack) console.error(`[TOMTOM ERROR] ${operation} stack`, err.stack);
    throw err;
  }
};

const removeLayerAndSource = (map, layerId, sourceId) => {
  if (!map) return;
  try {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  } catch (e) {
    /* map may be destroyed */
  }
};

const upsertLineLayer = (map, sourceId, layerId, coordinates, color, opacity = 0.85, dash = null) => {
  if (!map || !Array.isArray(coordinates)) return;

  const safeCoords = coordinates.filter(
    ([lng, lat]) =>
      Number.isFinite(lng) &&
      Number.isFinite(lat) &&
      isValidGpsCoord(lat, lng)
  );

  if (safeCoords.length < 2) {
    removeLayerAndSource(map, layerId, sourceId);
    return;
  }

  const geojsonFeature = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: safeCoords },
  };
  const existingSource = map.getSource(sourceId);
  if (existingSource) {
    tomTomCall('source.setData', () => existingSource.setData(geojsonFeature));
  } else {
    tomTomCall('addSource', () => map.addSource(sourceId, { type: 'geojson', data: geojsonFeature }));
    tomTomCall('addLayer', () =>
      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': color,
          'line-width': dash ? 4 : 6,
          'line-opacity': opacity,
          ...(dash ? { 'line-dasharray': dash } : {}),
        },
      })
    );
  }
};

export default function TrackingMap({
  customerLocation,
  handymanLocation,
  routeGeometry,
  routeCalcTimestamp = null,
  routeLoading = false,
  zoom = 13,
  className = 'h-full w-full min-h-0',
}) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);
  const mapGenRef = useRef(0);
  const readyGenRef = useRef(0);
  const [mapReady, setMapReady] = useState(false);

  const handymanLngLat = useMemo(() => toLngLat(handymanLocation), [
    handymanLocation?.latitude,
    handymanLocation?.longitude,
  ]);
  const customerLngLat = useMemo(() => toLngLat(customerLocation), [
    customerLocation?.latitude,
    customerLocation?.longitude,
  ]);

  const sanitizedRoute = useMemo(
    () => sanitizeRouteCoords(routeGeometry),
    [routeGeometry]
  );

  const geometryValid =
    sanitizedRoute.length >= 2 &&
    handymanLngLat &&
    customerLngLat &&
    isGeometryConsistent(sanitizedRoute, handymanLocation, customerLocation);

  const showRouteLoading =
    routeLoading &&
    handymanLngLat &&
    customerLngLat &&
    !geometryValid;

  const showTempRoute =
    handymanLngLat &&
    customerLngLat &&
    !geometryValid &&
    (showRouteLoading || sanitizedRoute.length < 2);

  const hasAnyLocation = !!(handymanLngLat || customerLngLat);
  const hasBothLocations = !!(handymanLngLat && customerLngLat);

  const primaryCenter = handymanLngLat || customerLngLat;
  const mapZoom = safeZoom(zoom, 13);

  console.log('[TRACKING MAP] customerLocation', customerLocation);
  console.log('[TRACKING MAP] handymanLocation', handymanLocation);
  console.log('[TRACKING MAP] rendering', {
    customerLngLat,
    handymanLngLat,
    hasAnyLocation,
    hasBothLocations,
    primaryCenter,
    mapZoom,
  });

  devGroup('[TRACKING MAP]', () => {
    console.log('current handyman =', handymanLocation);
    console.log('current customer =', customerLocation);
    console.log('route points =', sanitizedRoute.length);
    console.log('geometry valid =', geometryValid);
    console.log('temp straight line =', showTempRoute);
    console.log('route loading =', showRouteLoading);
  });

  const isMapAlive = (map, gen) =>
    !!map &&
    mapInstance.current === map &&
    gen === mapGenRef.current;

  // Create map once we have valid coordinates — do not destroy on coordinate updates
  useEffect(() => {
    const apiKey = import.meta.env.VITE_TOMTOM_API_KEY;
    console.log('[TOMTOM DEBUG] apiKey present =', !!apiKey);

    if (!apiKey) return;

    logContainerSize(mapRef, '(init effect)');

    if (!mapRef.current) {
      console.log('[TOMTOM DEBUG] init skipped — mapRef not attached');
      return;
    }

    if (mapInstance.current) {
      console.log('[TOMTOM DEBUG] init skipped — map already exists');
      return;
    }

    if (!isFiniteLngLat(primaryCenter)) {
      console.log('[TOMTOM DEBUG] init deferred — waiting for valid coordinates', {
        primaryCenter,
      });
      return;
    }

    const gen = ++mapGenRef.current;
    console.log('[TOMTOM DEBUG] init generation =', gen, '| center =', primaryCenter, '| zoom =', mapZoom);

    let map;
    try {
      map = tomTomCall('tt.map', () =>
        tt.map({
          key: apiKey,
          container: mapRef.current,
          center: primaryCenter,
          zoom: mapZoom,
        })
      );
      mapInstance.current = map;
    } catch (err) {
      mapInstance.current = null;
      return;
    }

    const onLoad = () => {
      if (!isMapAlive(map, gen)) {
        console.log('[TOMTOM DEBUG] map.load ignored — stale generation', {
          gen,
          current: mapGenRef.current,
        });
        return;
      }
      console.log('[TOMTOM DEBUG] map.load event — generation', gen);
      readyGenRef.current = gen;
      setMapReady(true);
      try {
        tomTomCall('resize', () => map.resize());
      } catch (e) {
        /* logged by tomTomCall */
      }
    };

    tomTomCall('map.on(load)', () => map.on('load', onLoad));

    const resizeTimer = setTimeout(() => {
      if (!isMapAlive(map, gen)) return;
      try {
        tomTomCall('resize', () => map.resize());
      } catch (e) {
        /* logged */
      }
    }, 150);

    return () => {
      clearTimeout(resizeTimer);
    };
  }, [
    primaryCenter?.[0],
    primaryCenter?.[1],
    mapZoom,
  ]);

  // StrictMode-safe teardown — only on component unmount
  useEffect(() => {
    return () => {
      mapGenRef.current += 1;
      readyGenRef.current = 0;
      setMapReady(false);

      const map = mapInstance.current;
      if (map) {
        try {
          map.remove();
        } catch (e) {
          console.error('[TOMTOM ERROR] map.remove (unmount)', e);
        }
        mapInstance.current = null;
      }

      markersRef.current.forEach((m) => {
        try {
          m.remove();
        } catch (e) {}
      });
      markersRef.current = [];
    };
  }, []);

  // Markers + routes + camera — only on live, loaded map instance
  useEffect(() => {
    const map = mapInstance.current;
    const gen = mapGenRef.current;

    if (!map || !mapReady || readyGenRef.current !== gen) {
      return;
    }

    if (!isMapAlive(map, gen)) {
      console.log('[TOMTOM DEBUG] markers effect skipped — map not alive');
      return;
    }

    logContainerSize(mapRef, '(markers effect)');

    markersRef.current.forEach((m) => {
      try {
        m.remove();
      } catch (e) {}
    });
    markersRef.current = [];

    if (customerLngLat) {
      try {
        const marker = tomTomCall('Marker.constructor(customer)', () => new tt.Marker({ color: '#0F4C75' }));
        tomTomCall('setLngLat(customer)', () => marker.setLngLat(customerLngLat));
        tomTomCall('marker.addTo(customer)', () => marker.addTo(map));
        markersRef.current.push(marker);
      } catch (error) {
        console.warn('[TRACKING MAP] Customer marker error:', error);
      }
    }

    if (handymanLngLat) {
      try {
        const marker = tomTomCall('Marker.constructor(handyman)', () => new tt.Marker({ color: '#28A745' }));
        tomTomCall('setLngLat(handyman)', () => marker.setLngLat(handymanLngLat));
        tomTomCall('marker.addTo(handyman)', () => marker.addTo(map));
        markersRef.current.push(marker);
      } catch (error) {
        console.warn('[TRACKING MAP] Handyman marker error:', error);
      }
    }

    if (geometryValid) {
      removeLayerAndSource(map, 'temp-route-layer', 'temp-route-source');
      upsertLineLayer(map, 'uber-route-source', 'uber-route-layer', sanitizedRoute, '#0F4C75');
    } else {
      removeLayerAndSource(map, 'uber-route-layer', 'uber-route-source');
      if (sanitizedRoute.length >= 2 && !geometryValid) {
        console.warn('[TRACKING MAP] Stale geometry rejected —', sanitizedRoute.length, 'points');
      }
    }

    if (showTempRoute && handymanLngLat && customerLngLat) {
      upsertLineLayer(
        map,
        'temp-route-source',
        'temp-route-layer',
        [handymanLngLat, customerLngLat],
        '#0F4C75',
        0.45,
        [2, 2]
      );
    } else {
      removeLayerAndSource(map, 'temp-route-layer', 'temp-route-source');
    }

    const points = [handymanLngLat, customerLngLat].filter(isFiniteLngLat);
    if (points.length === 0) return;

    const runCamera = () => {
      if (!isMapAlive(map, gen)) return;

      try {
        if (points.length === 1) {
          tomTomCall('setCenter', () => map.setCenter(points[0]));
          tomTomCall('setZoom', () => map.setZoom(15));
          return;
        }

        const directM = getDirectDistanceMeters(handymanLocation, customerLocation);
        if (directM < 80) {
          const centerLng = (points[0][0] + points[1][0]) / 2;
          const centerLat = (points[0][1] + points[1][1]) / 2;
          if (Number.isFinite(centerLng) && Number.isFinite(centerLat)) {
            tomTomCall('setCenter', () => map.setCenter([centerLng, centerLat]));
            tomTomCall('setZoom', () => map.setZoom(16));
          }
          return;
        }

        const bounds = tomTomCall('LngLatBounds.constructor', () => new tt.LngLatBounds());
        points.forEach((p) => {
          tomTomCall('bounds.extend', () => bounds.extend(p));
        });
        tomTomCall('fitBounds', () => map.fitBounds(bounds, { padding: 80, maxZoom: 17 }));
      } catch (error) {
        console.warn('[TRACKING MAP] Camera update failed:', error);
      }

      try {
        tomTomCall('resize', () => map.resize());
      } catch (e) {
        /* logged */
      }
    };

    if (map.loaded()) {
      runCamera();
    } else {
      const onStyleLoad = () => {
        if (!isMapAlive(map, gen)) return;
        map.off('load', onStyleLoad);
        runCamera();
      };
      map.on('load', onStyleLoad);
    }
  }, [
    mapReady,
    handymanLngLat?.[0],
    handymanLngLat?.[1],
    customerLngLat?.[0],
    customerLngLat?.[1],
    sanitizedRoute,
    geometryValid,
    showTempRoute,
    showRouteLoading,
    routeCalcTimestamp,
    handymanLocation,
    customerLocation,
  ]);

  if (!import.meta.env.VITE_TOMTOM_API_KEY) {
    return (
      <div className={`flex items-center justify-center bg-neutral ${className}`}>
        <div className="text-center p-6">
          <p className="text-primary font-bold mb-2">خريطة التتبع</p>
          <p className="text-sm text-textGray">أضف VITE_TOMTOM_API_KEY في ملف .env</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative min-h-0 ${className}`}
      style={{ width: '100%', height: '100%', minHeight: '300px' }}
    >
      <div ref={mapRef} className="absolute inset-0 h-full w-full" style={{ minHeight: '300px' }} />

      {!hasAnyLocation && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center bg-neutral/80 text-center p-6">
          <p className="text-primary font-bold">🔄 جاري تحميل الموقع...</p>
          <p className="mt-2 text-sm text-textGray">في انتظار إحداثيات GPS صالحة</p>
        </div>
      )}

      {hasAnyLocation && !hasBothLocations && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-white/95 px-4 py-1.5 text-xs font-medium text-primary shadow-md">
          {!handymanLngLat && 'في انتظار موقع الحرفي...'}
          {!customerLngLat && 'في انتظار موقع العميل...'}
        </div>
      )}

      {showRouteLoading && hasBothLocations && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-white/95 px-4 py-1.5 text-xs font-medium text-primary shadow-md">
          جاري حساب المسار...
        </div>
      )}
    </div>
  );
}
