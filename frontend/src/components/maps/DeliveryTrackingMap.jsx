import React, { useEffect, useRef, useState } from 'react';
import { Navigation, Clock, MapPin, AlertCircle, ShieldCheck, CheckCircle2, Truck } from 'lucide-react';
import RoutingMachine from './RoutingMachine';
import { createCustomIcon } from './CustomMarker';
import { determineActiveRoute, validateCoordinates } from '../../services/routingService';

/**
 * Modular Leaflet Delivery Tracking Map Component
 * Displays static Donor & NGO markers, dynamic live Volunteer marker (smooth non-flickering updates),
 * OSRM route switching, and floating metrics overlay (Distance & ETA).
 */
const DeliveryTrackingMap = ({
  donorLocation,
  ngoLocation,
  volunteerLocation,
  deliveryStatus = 'assigned',
  className = 'w-full h-[420px] sm:h-[500px] rounded-2xl overflow-hidden shadow-soft-card border border-[#E7EAF0]',
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const volunteerMarkerRef = useRef(null);
  const donorMarkerRef = useRef(null);
  const ngoMarkerRef = useRef(null);

  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [routeMetrics, setRouteMetrics] = useState({ distance: '—', duration: '—' });
  const [routeError, setRouteError] = useState(false);

  // Dynamically load Leaflet CSS & JS
  useEffect(() => {
    if (window.L) {
      setLeafletLoaded(true);
      return;
    }

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => setLeafletLoaded(true);
      document.body.appendChild(script);
    } else {
      const existingScript = document.getElementById('leaflet-js');
      existingScript.addEventListener('load', () => setLeafletLoaded(true));
    }
  }, []);

  // Initialize Map Instance once
  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current || mapInstanceRef.current) return;
    const L = window.L;

    const validCenterLoc = [volunteerLocation, donorLocation, ngoLocation]
      .find((loc) => loc && validateCoordinates(loc.lat, loc.lng));

    const initialCenter = validCenterLoc
      ? [Number(validCenterLoc.lat), Number(validCenterLoc.lng)]
      : [12.9546, 74.8847];

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      scrollWheelZoom: true,
    }).setView(initialCenter, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          // ignore cleanup error
        }
        mapInstanceRef.current = null;
      }
    };
  }, [leafletLoaded]);

  // Update Static & Live Markers smoothly without map re-renders (Requirement 5)
  useEffect(() => {
    if (!leafletLoaded || !mapInstanceRef.current) return;
    const L = window.L;
    const map = mapInstanceRef.current;

    // 1. Donor Marker
    if (donorLocation && typeof donorLocation.lat === 'number' && typeof donorLocation.lng === 'number') {
      const donorIcon = createCustomIcon(L, 'donor');
      const popupHtml = `
        <div style="font-family: system-ui, -apple-system, sans-serif; padding: 4px 2px; min-width: 180px;">
          <div style="font-weight: 900; font-size: 13px; color: #0F172A; margin-bottom: 4px;">
            ${donorLocation.title || 'Food Donor'}
          </div>
          ${donorLocation.address ? `
            <div style="font-size: 11px; color: #475569; margin-bottom: 4px; font-weight: 500; line-height: 1.3;">
              Address: ${donorLocation.address}
            </div>
          ` : ''}
          ${donorLocation.phone ? `
            <div style="font-size: 11px; font-weight: 700; color: #0F172A; border-top: 1px solid #E2E8F0; padding-top: 4px; margin-top: 4px;">
              Contact: <a href="tel:${donorLocation.phone}" style="color: #059669; font-weight: 800; text-decoration: none;">${donorLocation.phone}</a>
            </div>
          ` : ''}
        </div>
      `;

      if (!donorMarkerRef.current) {
        donorMarkerRef.current = L.marker([donorLocation.lat, donorLocation.lng], { icon: donorIcon })
          .addTo(map)
          .bindTooltip(`Donor: ${donorLocation.title || 'Food Pickup'}`, { direction: 'top', offset: [0, -12] })
          .bindPopup(popupHtml);
      } else {
        donorMarkerRef.current.setLatLng([donorLocation.lat, donorLocation.lng]);
        donorMarkerRef.current.setPopupContent(popupHtml);
      }
    }

    // 2. NGO Marker
    if (ngoLocation && typeof ngoLocation.lat === 'number' && typeof ngoLocation.lng === 'number') {
      const ngoIcon = createCustomIcon(L, 'ngo');
      const ngoPopupHtml = `
        <div style="font-family: system-ui, -apple-system, sans-serif; padding: 4px 2px; min-width: 190px;">
          <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 6px;">
            <span style="background-color: #EFF6FF; color: #2563EB; padding: 2px 8px; border-radius: 9999px; font-weight: 800; font-size: 10px; border: 1px solid #BFDBFE;">
              NGO DETAILS
            </span>
          </div>
          <div style="font-weight: 900; font-size: 13px; color: #0F172A; margin-bottom: 3px;">
            ${ngoLocation.title || 'NGO Dropoff'}
          </div>
          ${ngoLocation.address ? `
            <div style="font-size: 11px; color: #64748B; margin-bottom: 8px; font-weight: 500; line-height: 1.3;">
              📍 ${ngoLocation.address}
            </div>
          ` : ''}
          ${ngoLocation.phone ? `
            <div style="border-top: 1px solid #E2E8F0; padding-top: 6px; font-size: 11px; font-weight: 700; color: #334155;">
              📞 Phone: <a href="tel:${ngoLocation.phone}" style="color: #2563EB; font-weight: 800; text-decoration: none;">${ngoLocation.phone}</a>
            </div>
          ` : ''}
        </div>
      `;

      if (!ngoMarkerRef.current) {
        ngoMarkerRef.current = L.marker([ngoLocation.lat, ngoLocation.lng], { icon: ngoIcon })
          .addTo(map)
          .bindTooltip(`NGO: ${ngoLocation.title || 'Food Dropoff'}`, { direction: 'top', offset: [0, -12] })
          .bindPopup(ngoPopupHtml);
      } else {
        ngoMarkerRef.current.setLatLng([ngoLocation.lat, ngoLocation.lng]);
        ngoMarkerRef.current.setPopupContent(ngoPopupHtml);
      }
    }

    // 3. Volunteer Live Marker (Requirement 5: Flicker-free update)
    if (volunteerLocation && typeof volunteerLocation.lat === 'number' && typeof volunteerLocation.lng === 'number') {
      const volunteerIcon = createCustomIcon(L, 'courier');
      const volPopupHtml = `
        <div style="font-family: system-ui, -apple-system, sans-serif; padding: 4px 2px; min-width: 180px;">
          <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 6px;">
            <span style="background-color: #FFF7ED; color: #EA580C; padding: 2px 8px; border-radius: 9999px; font-weight: 800; font-size: 10px; border: 1px solid #FFEDD5;">
              COURIER DETAILS
            </span>
          </div>
          <div style="font-weight: 900; font-size: 13px; color: #0F172A; margin-bottom: 3px;">
            ${volunteerLocation.title || 'Volunteer Courier'}
          </div>
          ${volunteerLocation.phone ? `
            <div style="border-top: 1px solid #E2E8F0; padding-top: 6px; font-size: 11px; font-weight: 700; color: #334155;">
              📞 Phone: <a href="tel:${volunteerLocation.phone}" style="color: #EA580C; font-weight: 800; text-decoration: none;">${volunteerLocation.phone}</a>
            </div>
          ` : ''}
        </div>
      `;

      if (!volunteerMarkerRef.current) {
        volunteerMarkerRef.current = L.marker([volunteerLocation.lat, volunteerLocation.lng], { icon: volunteerIcon })
          .addTo(map)
          .bindTooltip(`Courier: ${volunteerLocation.title || 'Live Volunteer'}`, { direction: 'top', offset: [0, -12] })
          .bindPopup(volPopupHtml);
      } else {
        // Smoothly update position without resetting map or causing flicker
        volunteerMarkerRef.current.setLatLng([volunteerLocation.lat, volunteerLocation.lng]);
        volunteerMarkerRef.current.setPopupContent(volPopupHtml);
      }
    }

    // Auto-fit map bounds dynamically around active markers (centering Mangalore/current location)
    const validPoints = [donorLocation, ngoLocation, volunteerLocation]
      .filter((loc) => loc && typeof loc.lat === 'number' && typeof loc.lng === 'number' && loc.lat !== 0 && loc.lng !== 0)
      .map((loc) => [loc.lat, loc.lng]);

    if (validPoints.length > 0) {
      try {
        if (validPoints.length === 1) {
          map.setView(validPoints[0], 14);
        } else {
          const bounds = L.latLngBounds(validPoints);
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
      } catch (e) {
        // ignore bounds calculation error
      }
    }
  }, [leafletLoaded, donorLocation, ngoLocation, volunteerLocation]);

  // Determine Active Route Endpoints (Requirement 6 & 8: Volunteer->Donor vs Volunteer->NGO)
  const activeRouteConfig = determineActiveRoute(
    deliveryStatus,
    volunteerLocation,
    donorLocation,
    ngoLocation
  );

  const getStatusBadge = () => {
    switch (deliveryStatus) {
      case 'on_the_way':
        return { label: 'In Transit to NGO', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'picked_up':
        return { label: 'Food Picked Up', color: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'delivered':
        return { label: 'Delivery Completed', color: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'accepted':
      case 'assigned':
      default:
        return { label: 'En Route to Donor Pickup', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
  };

  const badgeInfo = getStatusBadge();

  return (
    <div className={`relative ${className}`}>
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Status & Metrics Banner (Requirement 7) */}
      <div className="absolute top-4 left-4 right-4 z-[400] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white/95 backdrop-blur-md p-3.5 sm:p-4 rounded-2xl border border-[#E7EAF0] shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center font-bold shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border ${badgeInfo.color}`}>
                {badgeInfo.label}
              </span>
              <span className="text-[11px] text-slate-500 font-bold">{activeRouteConfig.phaseLabel}</span>
            </div>
            <p className="text-xs font-black text-[#0F172A] mt-0.5 line-clamp-1">
              To: {activeRouteConfig.to?.title || activeRouteConfig.to?.address || 'Destination'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 border-slate-100 pt-2 sm:pt-0 shrink-0">
          <div className="text-left sm:text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Remaining Dist</span>
            <span className="text-sm font-black text-[#0F172A]">{routeMetrics.distance}</span>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Est. Time (ETA)</span>
            <span className="text-sm font-black text-emerald-600">{routeMetrics.duration}</span>
          </div>
        </div>
      </div>

      {/* Routing Error / GPS Fallback Warning (Task 6 & 10) */}
      {routeError && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-2xl z-[400] border border-amber-500/40 flex items-center gap-2 max-w-[90%] text-center">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{typeof routeError === 'string' ? routeError : 'Routing error. Direct location view active.'}</span>
        </div>
      )}

      {/* Leaflet OSRM Route Layer (Task 12) */}
      {leafletLoaded && mapInstanceRef.current && activeRouteConfig.from && activeRouteConfig.to && (
        <RoutingMachine
          map={mapInstanceRef.current}
          from={activeRouteConfig.from}
          to={activeRouteConfig.to}
          donor={donorLocation}
          ngo={ngoLocation}
          onRouteFound={({ distance, duration }) => {
            setRouteError(false);
            setRouteMetrics({ distance, duration });
          }}
          onError={(errMsg) => {
            setRouteError(errMsg || 'Unable to calculate driving route');
          }}
        />
      )}
    </div>
  );
};

export default DeliveryTrackingMap;
