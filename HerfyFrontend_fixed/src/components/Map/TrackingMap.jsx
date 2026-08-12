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
    existingSource.setData(geojsonFeature);
  } else {
    map.addSource(sourceId, { type: 'geojson', data: geojsonFeature });
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
    });
  }
};

export default function TrackingMap({
  customerLocation,
  handymanLocation,
  routeGeometry,
  routeCalcTimestamp = null,
  routeLoading = false,
  zoom = 13,
  className = 'h-full w-full',
}) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);
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

  console.log('[TRACKING MAP] customerLocation', customerLocation);
  console.log('[TRACKING MAP] handymanLocation', handymanLocation);
  console.log('[TRACKING MAP] rendering', {
    customerLngLat,
    handymanLngLat,
    hasAnyLocation,
    hasBothLocations,
  });

  devGroup('[TRACKING MAP]', () => {
    console.log('current handyman =', handymanLocation);
    console.log('current customer =', customerLocation);
    console.log('route points =', sanitizedRoute.length);
    console.log('geometry valid =', geometryValid);
    console.log('temp straight line =', showTempRoute);
    console.log('route loading =', showRouteLoading);
  });

  // Map init — once; no Cairo/user fallback — neutral world center until markers arrive
  useEffect(() => {
    const apiKey = import.meta.env.VITE_TOMTOM_API_KEY;
    if (!apiKey || !mapRef.current) return;

    const center = handymanLngLat || customerLngLat || [0, 20];
    const initialZoom = handymanLngLat || customerLngLat ? zoom : 2;

    try {
      const map = tt.map({
        key: apiKey,
        container: mapRef.current,
        center,
        zoom: initialZoom,
      });

      mapInstance.current = map;

      map.on('load', () => {
        setMapReady(true);
        try {
          map.resize();
        } catch (e) {}
      });

      setTimeout(() => {
        try {
          map.resize();
        } catch (e) {}
      }, 150);
    } catch (err) {
      console.warn('[TRACKING MAP] Init failed:', err);
    }

    return () => {
      setMapReady(false);
      try {
        mapInstance.current?.remove();
      } catch (e) {}
      mapInstance.current = null;
    };
  }, []);

  // Markers + routes — only after map is ready; never pass null to TomTom
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapReady) return;

    markersRef.current.forEach((m) => {
      try { m.remove(); } catch (e) {}
    });
    markersRef.current = [];

    if (customerLngLat) {
      try {
        const marker = new tt.Marker({ color: '#0F4C75' })
          .setLngLat(customerLngLat)
          .addTo(map);
        markersRef.current.push(marker);
      } catch (error) {
        console.warn('[TRACKING MAP] Customer marker error:', error);
      }
    }

    if (handymanLngLat) {
      try {
        const marker = new tt.Marker({ color: '#28A745' })
          .setLngLat(handymanLngLat)
          .addTo(map);
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

    const points = [handymanLngLat, customerLngLat].filter(Boolean);
    if (points.length === 0) return;

    try {
      if (points.length === 1) {
        map.setCenter(points[0]);
        map.setZoom(15);
        return;
      }

      const directM = getDirectDistanceMeters(handymanLocation, customerLocation);
      if (directM < 80) {
        const centerLng = (points[0][0] + points[1][0]) / 2;
        const centerLat = (points[0][1] + points[1][1]) / 2;
        if (Number.isFinite(centerLng) && Number.isFinite(centerLat)) {
          map.setCenter([centerLng, centerLat]);
          map.setZoom(16);
        }
        return;
      }

      const bounds = new tt.LngLatBounds();
      points.forEach((p) => {
        if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
          bounds.extend(p);
        }
      });
      map.fitBounds(bounds, { padding: 80, maxZoom: 17 });
    } catch (error) {
      console.warn('[TRACKING MAP] Camera update failed:', error);
    }

    try {
      map.resize();
    } catch (e) {}
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
    <div className={`relative ${className}`} style={{ width: '100%', height: '100%', minHeight: '300px' }}>
      <div ref={mapRef} className="absolute inset-0" />

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
