import { useRef, useEffect } from 'react';
import tt from '@tomtom-international/web-sdk-maps';

export default function TrackingMap({
  customerLocation,
  handymanLocation,
  center,
  zoom = 13,
  className = 'h-full w-full',
}) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_TOMTOM_API_KEY;
    if (!apiKey || !mapRef.current) return;

    const defaultCenter = center ||
      (customerLocation
        ? [customerLocation.longitude, customerLocation.latitude]
        : [31.2357, 30.0444]);

    mapInstance.current = tt.map({
      key: apiKey,
      container: mapRef.current,
      center: defaultCenter,
      zoom,
    });

    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (customerLocation) {
      const marker = new tt.Marker({ color: '#0F4C75' })
        .setLngLat([customerLocation.longitude, customerLocation.latitude])
        .addTo(mapInstance.current);
      markersRef.current.push(marker);
    }

    if (handymanLocation) {
      const marker = new tt.Marker({ color: '#28A745' })
        .setLngLat([handymanLocation.longitude, handymanLocation.latitude])
        .addTo(mapInstance.current);
      markersRef.current.push(marker);
    }

    if (customerLocation && handymanLocation) {
      const bounds = new tt.LngLatBounds();
      bounds.extend([customerLocation.longitude, customerLocation.latitude]);
      bounds.extend([handymanLocation.longitude, handymanLocation.latitude]);
      mapInstance.current.fitBounds(bounds, { padding: 60 });
    }
  }, [customerLocation, handymanLocation]);

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
