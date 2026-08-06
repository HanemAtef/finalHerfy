import { useRef, useEffect } from 'react';
import tt from '@tomtom-international/web-sdk-maps';
import '@tomtom-international/web-sdk-maps/dist/maps.css';

const isValidCoord = (lat, lng) =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng);

export default function TrackingMap({
  customerLocation,
  handymanLocation,
  pickupLocation,
  destinationLocation,
  center,
  zoom = 13,
  className = 'h-full w-full',
}) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);

  // Log coordinates audit before rendering
  console.group('🗺️ [TrackingMap Coordinates Audit]');
  console.log('📍 customerLocation:', customerLocation);
  console.log('📍 handymanLocation:', handymanLocation);
  console.log('📍 pickupLocation:', pickupLocation);
  console.log('📍 destinationLocation:', destinationLocation);
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
      mapInstance.current = tt.map({
        key: apiKey,
        container: mapRef.current,
        center: defaultCenter,
        zoom,
      });

      // Log DOM container dimensions immediately after map creation
      const domContainer = mapRef.current;
      const sdkContainer = mapInstance.current.getContainer();
      console.log('📐 [TrackingMap DOM Audit]', {
        domClientWidth: domContainer?.clientWidth,
        domClientHeight: domContainer?.clientHeight,
        domOffsetWidth: domContainer?.offsetWidth,
        domOffsetHeight: domContainer?.offsetHeight,
        sdkClientWidth: sdkContainer?.clientWidth,
        sdkClientHeight: sdkContainer?.clientHeight,
      });

      // Force canvas layout recalculation for flex containers
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

    // 3. Adjust Map Bounds between Origin (Handyman) & Destination (Customer)
    const activeCoords = [];
    if (handyOrigin) activeCoords.push([handyOrigin.longitude, handyOrigin.latitude]);
    if (custDestination) activeCoords.push([custDestination.longitude, custDestination.latitude]);

    const validActiveCoords = activeCoords.filter(
      (c) => Array.isArray(c) && c.length === 2 && isValidCoord(c[1], c[0])
    );

    if (validActiveCoords.length >= 2) {
      try {
        console.log('📍 [SDK Call] Fitting map bounds between Handyman & Customer:', validActiveCoords);
        const bounds = new tt.LngLatBounds();
        validActiveCoords.forEach((coord) => {
          console.log('📍 [SDK Call] bounds.extend:', coord);
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

  return <div ref={mapRef} className={className} />;
}