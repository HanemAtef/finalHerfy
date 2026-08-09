import { useRef, useEffect } from 'react';
import tt from '@tomtom-international/web-sdk-maps';
import '@tomtom-international/web-sdk-maps/dist/maps.css';

const isValidCoord = (lat, lng) =>
  typeof lat === 'number' &&
  typeof lng === 'number' &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180 &&
  !(lat === 0 && lng === 0);

export default function TrackingMap({
  customerLocation,
  handymanLocation,
  pickupLocation,
  destinationLocation,
  routeGeometry,
  center,
  zoom = 13,
  className = 'h-full w-full',
}) {
 const mapRef = useRef(null);
const mapInstance = useRef(null);
const markersRef = useRef([]);
const mapLoaded = useRef(false);

  // Log coordinates audit before rendering
  console.group('🗺️ [TrackingMap Coordinates Audit]');
  console.log('📍 customerLocation:', customerLocation);
  console.log('📍 handymanLocation:', handymanLocation);
  console.log('📍 pickupLocation:', pickupLocation);
  console.log('📍 destinationLocation:', destinationLocation);
  console.log('📍 routeGeometry points count:', routeGeometry?.length || 0);
  console.log('📍 center:', center);
  
  const nullCheck = {
    customerLocation: customerLocation ? (isValidCoord(customerLocation.latitude, customerLocation.longitude) ? 'VALID' : 'CONTAINS NULL/INVALID') : 'NULL/UNDEFINED',
    handymanLocation: handymanLocation ? (isValidCoord(handymanLocation.latitude, handymanLocation.longitude) ? 'VALID' : 'CONTAINS NULL/INVALID') : 'NULL/UNDEFINED',
    pickupLocation: pickupLocation ? (isValidCoord(pickupLocation.latitude, pickupLocation.longitude) ? 'VALID' : 'CONTAINS NULL/INVALID') : 'NULL/UNDEFINED',
    destinationLocation: destinationLocation ? (isValidCoord(destinationLocation.latitude, destinationLocation.longitude) ? 'VALID' : 'CONTAINS NULL/INVALID') : 'NULL/UNDEFINED',
    center: center ? (isValidCoord(center[1], center[0]) ? 'VALID' : 'CONTAINS NULL/INVALID') : 'NULL/UNDEFINED',
  };
  console.table(nullCheck);
  console.groupEnd();

  // ✅ Map initialization
  useEffect(() => {
    const apiKey = import.meta.env.VITE_TOMTOM_API_KEY;
    if (!apiKey || !mapRef.current) return;

    let defaultCenter = [31.2357, 30.0444];
    if (Array.isArray(center) && center.length === 2 && isValidCoord(center[1], center[0])) {
      defaultCenter = center;
    } else if (center && typeof center === 'object' && isValidCoord(center.latitude, center.longitude)) {
      defaultCenter = [center.longitude, center.latitude];
    } else if (handymanLocation && isValidCoord(handymanLocation.latitude, handymanLocation.longitude)) {
      defaultCenter = [handymanLocation.longitude, handymanLocation.latitude];
    } else if (customerLocation && isValidCoord(customerLocation.latitude, customerLocation.longitude)) {
      defaultCenter = [customerLocation.longitude, customerLocation.latitude];
    } else if (pickupLocation && isValidCoord(pickupLocation.latitude, pickupLocation.longitude)) {
      defaultCenter = [pickupLocation.longitude, pickupLocation.latitude];
    }

    console.log('📍 [SDK Call] tt.map initializing with center:', defaultCenter);
    if (!isValidCoord(defaultCenter[1], defaultCenter[0])) {
      console.error('❌ [SDK Error Guard] Invalid defaultCenter detected, falling back to Cairo:', defaultCenter);
      defaultCenter = [31.2357, 30.0444];
    }

    try {
      // Step 11: Print DOM container metrics before map creation
      const domContainer = mapRef.current;
      const rect = domContainer?.getBoundingClientRect();
      console.log('📐 [Step 11 DOM Metrics before tt.map]', {
        offsetWidth: domContainer?.offsetWidth,
        offsetHeight: domContainer?.offsetHeight,
        clientWidth: domContainer?.clientWidth,
        clientHeight: domContainer?.clientHeight,
        rect: rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null,
      });

mapInstance.current = tt.map({
  key: apiKey,
  container: mapRef.current,
  center: defaultCenter,
  zoom,
});

mapInstance.current.on("load", () => {
  console.log("✅ TomTom Style Loaded");
  mapLoaded.current = true;
  // Step 12: Print DOM container metrics after map load
   mapInstance.current.resize();
});
      const sdkContainer = mapInstance.current.getContainer();
      console.log('📐 [TrackingMap SDK Container Metrics]', {
        sdkClientWidth: sdkContainer?.clientWidth,
        sdkClientHeight: sdkContainer?.clientHeight,
      });

      setTimeout(() => {
        try {
          mapInstance.current?.resize();
          console.log('📐 [TrackingMap SDK] mapInstance.resize() executed successfully');
        } catch (e) {}
      }, 150);
    } catch (err) {
      console.warn('❌ [TrackingMap] Failed to initialize TomTom map:', err);
    }

    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, []);

  // ✅ Markers and route bounds update (Uber-style tracking: Handyman -> Customer)
  useEffect(() => {
   if (!mapInstance.current) return;

if (!mapLoaded.current) {
  console.log("⏳ Waiting for TomTom style...");
  return;
}

    // Clear old markers
    markersRef.current.forEach((m) => {
      try { m.remove(); } catch (e) {}
    });
    markersRef.current = [];

    // Define Trip Origin (Handyman) & Target Destination (Customer / Job Site)
    const handyOrigin = handymanLocation && isValidCoord(handymanLocation.latitude, handymanLocation.longitude)
      ? handymanLocation
      : null;

    const custDestination = customerLocation && isValidCoord(customerLocation.latitude, customerLocation.longitude)
      ? customerLocation
      : (pickupLocation && isValidCoord(pickupLocation.latitude, pickupLocation.longitude)
        ? pickupLocation
        : (destinationLocation && isValidCoord(destinationLocation.latitude, destinationLocation.longitude)
          ? destinationLocation
          : null));

    console.log('📍 [Uber Tracking Model State]', { handyOrigin, custDestination });

    // 1. Add Customer / Job Site Destination Marker (Blue)
    if (custDestination) {
      const coord = [custDestination.longitude, custDestination.latitude];
      console.log('📍 [SDK Call] Adding Customer Destination Marker:', coord);
      try {
        const marker = new tt.Marker({ color: '#0F4C75' })
          .setLngLat(coord)
          .addTo(mapInstance.current);
        markersRef.current.push(marker);
      } catch (error) {
        console.warn('Could not add customer destination marker:', error);
      }
    }

    // 2. Add Handyman Origin Marker (Green)
    if (handyOrigin) {
      const coord = [handyOrigin.longitude, handyOrigin.latitude];
      console.log('📍 [SDK Call] Adding Handyman Origin Marker:', coord);
      try {
        const marker = new tt.Marker({ color: '#28A745' })
          .setLngLat(coord)
          .addTo(mapInstance.current);
        markersRef.current.push(marker);
      } catch (error) {
        console.warn('Could not add handyman origin marker:', error);
      }
    }

    // 3. Render Uber Driving Route Layer
    const routeCoords = Array.isArray(routeGeometry) && routeGeometry.length >= 2
      ? routeGeometry.filter((c) => Array.isArray(c) && c.length === 2 && isValidCoord(c[1], c[0]))
      : (handyOrigin && custDestination
        ? [[handyOrigin.longitude, handyOrigin.latitude], [custDestination.longitude, custDestination.latitude]]
        : []);
console.log("🛣 routeCoords =", JSON.stringify(routeCoords, null, 2));
    if (routeCoords.length >= 2) {
      const geojsonFeature = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: routeCoords,
        },
      };

      // Step 4: Log immediately before addSource / setData
      console.log('🗺️ [Step 4 Pre-Source Audit]', {
        routeGeometry,
        geojsonFeature,
        coordinatesLength: routeCoords.length,
        firstPoint: routeCoords[0],
        lastPoint: routeCoords[routeCoords.length - 1],
      });

      try {
        const existingSource = mapInstance.current.getSource('uber-route-source');
        if (existingSource) {
          existingSource.setData(geojsonFeature);
          // Step 7: Verification after setData
          console.log('🗺️ [Step 7 setData Verification] Source data updated with coordinates count:', routeCoords.length);
        } else {
          mapInstance.current.addSource('uber-route-source', {
            type: 'geojson',
            data: geojsonFeature,
          });

          // Step 5: Verify source exists after addSource
          const addedSource = mapInstance.current.getSource('uber-route-source');
          console.log('🗺️ [Step 5 Source Verification]', {
            sourceExists: !!addedSource,
            sourceType: addedSource?.type,
          });

          mapInstance.current.addLayer({
            id: 'uber-route-layer',
            type: 'line',
            source: 'uber-route-source',
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#0F4C75',
              'line-width': 6,
              'line-opacity': 0.85,
            },
          });

          // Step 6: Verify layer exists after addLayer
          const addedLayer = mapInstance.current.getLayer('uber-route-layer');
          console.log('🗺️ [Step 6 Layer Verification]', {
            layerExists: !!addedLayer,
            layerId: addedLayer?.id,
            layerType: addedLayer?.type,
          });
        }
      } catch (err) {
        console.warn('Could not render route layer:', err);
      }
    }

    // 4. Adjust Map Bounds between Origin (Handyman) & Destination (Customer)
    const activeCoords = routeCoords.length >= 2 ? routeCoords : [];
    if (activeCoords.length === 0) {
      if (handyOrigin) activeCoords.push([handyOrigin.longitude, handyOrigin.latitude]);
      if (custDestination) activeCoords.push([custDestination.longitude, custDestination.latitude]);
    }

    const validActiveCoords = activeCoords.filter(
      (c) => Array.isArray(c) && c.length === 2 && isValidCoord(c[1], c[0])
    );

    if (validActiveCoords.length >= 2) {
      try {
        console.log('📍 [SDK Call] Fitting map bounds between Handyman & Customer:', validActiveCoords);
        const bounds = new tt.LngLatBounds();
        validActiveCoords.forEach((coord) => {
          bounds.extend(coord);
        });
        mapInstance.current.fitBounds(bounds, { padding: 60 });
      } catch (error) {
        console.warn('Could not fit bounds:', error);
      }
    } else if (validActiveCoords.length === 1) {
      try {
        console.log('📍 [SDK Call] Setting map center to active coordinate:', validActiveCoords[0]);
        mapInstance.current.setCenter(validActiveCoords[0]);
      } catch (e) {}
    }
  }, [
    customerLocation?.latitude,
    customerLocation?.longitude,
    handymanLocation?.latitude,
    handymanLocation?.longitude,
    pickupLocation?.latitude,
    pickupLocation?.longitude,
    destinationLocation?.latitude,
    destinationLocation?.longitude,
    routeGeometry,
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
      ref={mapRef}
      className={className}
      style={{ width: '100%', height: '100%', minHeight: '300px' }}
    />
  );
}