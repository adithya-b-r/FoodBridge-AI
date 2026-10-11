/**
 * Comprehensive Robust Routing Service & OSRM Engine
 * Standardizes coordinate formats, enforces strict boundary validations,
 * formats URLs without syntax errors, and provides detailed debug logging.
 */

/**
 * Validate every coordinate before routing (Task 3 & 4)
 * Returns true if valid finite number within boundaries and non-zero
 */
export const validateCoordinates = (lat, lng) => {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  if (typeof lat === 'string' && lat.trim() === '') return false;
  if (typeof lng === 'string' && lng.trim() === '') return false;

  const numLat = Number(lat);
  const numLng = Number(lng);

  if (!isFinite(numLat) || !isFinite(numLng) || isNaN(numLat) || isNaN(numLng)) return false;
  if (numLat === 0 && numLng === 0) return false;
  if (numLat < -90 || numLat > 90) return false;
  if (numLng < -180 || numLng > 180) return false;

  return true;
};

export const formatDistance = (meters) => {
  if (meters === undefined || meters === null || isNaN(Number(meters))) return '—';
  const numMeters = Number(meters);
  if (numMeters < 1000) {
    return `${Math.round(numMeters)} m`;
  }
  return `${(numMeters / 1000).toFixed(1)} km`;
};

export const formatDuration = (seconds) => {
  if (seconds === undefined || seconds === null || isNaN(Number(seconds))) return '—';
  const numSecs = Number(seconds);
  const mins = Math.round(numSecs / 60);
  if (mins < 60) {
    return `${mins} mins`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours} hr ${remainingMins} mins`;
};

/**
 * Snap off-road coordinates (e.g. airport terminals/runways) to nearest public drivable road
 * OSRM Nearest API URL format: /nearest/v1/driving/{lng},{lat}
 */
export const snapToNearestRoad = async (lat, lng) => {
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (!validateCoordinates(numLat, numLng)) return { lat: numLat, lng: numLng };

  try {
    const url = `https://router.project-osrm.org/nearest/v1/driving/${numLng.toFixed(6)},${numLat.toFixed(6)}?number=1`;
    const res = await fetch(url);
    if (!res.ok) return { lat: numLat, lng: numLng };

    const data = await res.json();
    if (data.code === 'Ok' && data.waypoints && data.waypoints.length > 0) {
      const snapped = data.waypoints[0].location; // [lng, lat]
      console.log(`[ROUTING AUDIT] Snapped (${numLat}, ${numLng}) -> (${snapped[1]}, ${snapped[0]}) on nearest road`);
      return { lat: Number(snapped[1]), lng: Number(snapped[0]) };
    }
  } catch (err) {
    console.warn('[ROUTING AUDIT] OSRM Nearest Road snapping warning:', err);
  }

  return { lat: numLat, lng: numLng };
};

/**
 * Fetch driving route between start and destination using OSRM REST API (Task 2, 3, 5, 6, 7)
 * URL Format: https://router.project-osrm.org/route/v1/driving/{lng},{lat};{lng},{lat}?overview=full&geometries=geojson&steps=true
 */
export const fetchOSRMRoute = async (startLat, startLng, endLat, endLng, contextData = {}) => {
  const nStartLat = Number(startLat);
  const nStartLng = Number(startLng);
  const nEndLat = Number(endLat);
  const nEndLng = Number(endLng);

  // Task 5: Log coordinates before every routing request
  console.log('[ROUTING AUDIT] Coordinates received for route request:', {
    volunteer: contextData.volunteer || { lat: nStartLat, lng: nStartLng },
    donor: contextData.donor || null,
    ngo: contextData.ngo || null,
    startPointUsed: { lat: nStartLat, lng: nStartLng },
    endPointUsed: { lat: nEndLat, lng: nEndLng },
  });

  // Task 3: Validate coordinates
  if (!validateCoordinates(nStartLat, nStartLng) || !validateCoordinates(nEndLat, nEndLng)) {
    const errorMsg = 'Invalid or non-finite coordinates provided for routing';
    console.error('[ROUTING AUDIT ERROR]', errorMsg, {
      start: { lat: nStartLat, lng: nStartLng },
      end: { lat: nEndLat, lng: nEndLng },
    });
    return { success: false, error: errorMsg };
  }

  // Snap off-road start/end points to nearest drivable road
  const snappedStart = await snapToNearestRoad(nStartLat, nStartLng);
  const snappedEnd = await snapToNearestRoad(nEndLat, nEndLng);

  // Task 2: Format URL strictly: LONGITUDE,LATITUDE
  const startParam = `${snappedStart.lng.toFixed(6)},${snappedStart.lat.toFixed(6)}`;
  const endParam = `${snappedEnd.lng.toFixed(6)},${snappedEnd.lat.toFixed(6)}`;
  const primaryUrl = `https://router.project-osrm.org/route/v1/driving/${startParam};${endParam}?overview=full&geometries=geojson&steps=true`;
  const fallbackUrl = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${startParam};${endParam}?overview=full&geometries=geojson&steps=true`;

  // Task 5: Log final OSRM request URL
  console.log('[ROUTING AUDIT] Final OSRM Request URL:', primaryUrl);

  try {
    let response = await fetch(primaryUrl);
    let responseText = '';

    if (!response.ok) {
      responseText = await response.text();
      console.warn(`[ROUTING AUDIT] Primary OSRM failed (${response.status} - ${responseText}). Trying mirror fallback...`);
      response = await fetch(fallbackUrl);
      if (!response.ok) {
        const fallbackText = await response.text();
        // Task 6: Log full response body and status code
        console.error('[ROUTING AUDIT ERROR] Both OSRM servers failed:', {
          primaryStatus: response.status,
          primaryBody: responseText,
          fallbackBody: fallbackText,
        });
        throw new Error(`OSRM HTTP ${response.status}: ${fallbackText || responseText || 'Route server unavailable'}`);
      }
    }

    const data = await response.json();
    console.log('[ROUTING AUDIT] OSRM Route Response payload:', data);

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      throw new Error(data.message || 'No drivable route available between points');
    }

    const primaryRoute = data.routes[0];
    const distanceMeters = primaryRoute.distance;
    const durationSeconds = primaryRoute.duration;

    // Task 7: Convert OSRM GeoJSON [[lng, lat]] to Leaflet [[lat, lng]]
    const leafCoords = primaryRoute.geometry.coordinates.map(([lng, lat]) => [Number(lat), Number(lng)]);

    console.log('[ROUTING AUDIT SUCCESS] Route calculated successfully:', {
      distance: formatDistance(distanceMeters),
      duration: formatDuration(durationSeconds),
      pointCount: leafCoords.length,
    });

    return {
      success: true,
      coordinates: leafCoords, // Leaflet latLng format: [[lat, lng], ...]
      distanceMeters,
      durationSeconds,
      formattedDistance: formatDistance(distanceMeters),
      formattedDuration: formatDuration(durationSeconds),
    };
  } catch (error) {
    console.error('[ROUTING AUDIT ERROR] OSRM Route calculation error:', error);
    return {
      success: false,
      error: error.message || 'OSRM routing service unavailable',
    };
  }
};

/**
 * Determine dynamic route endpoints based on delivery status (Task 8)
 * Pre-pickup (assigned / accepted): Volunteer ➔ Donor
 * Post-pickup (picked_up / on_the_way): Volunteer ➔ NGO
 */
export const determineActiveRoute = (status, volunteerPos, donorPos, ngoPos) => {
  const isPostPickup = status === 'picked_up' || status === 'on_the_way' || status === 'delivered';

  const validVol = volunteerPos && validateCoordinates(volunteerPos.lat, volunteerPos.lng)
    ? { lat: Number(volunteerPos.lat), lng: Number(volunteerPos.lng), title: volunteerPos.title }
    : null;

  const validDonor = donorPos && validateCoordinates(donorPos.lat, donorPos.lng)
    ? { lat: Number(donorPos.lat), lng: Number(donorPos.lng), title: donorPos.title, address: donorPos.address }
    : null;

  const validNgo = ngoPos && validateCoordinates(ngoPos.lat, ngoPos.lng)
    ? { lat: Number(ngoPos.lat), lng: Number(ngoPos.lng), title: ngoPos.title, address: ngoPos.address }
    : null;

  if (isPostPickup) {
    const phaseLabel = status === 'delivered'
      ? 'Delivered at NGO Hub'
      : status === 'on_the_way'
      ? 'In Transit to NGO Dropoff'
      : 'Food Picked Up (Ready to Depart)';

    return {
      from: validVol || validDonor,
      to: validNgo,
      routeType: 'volunteer_to_ngo',
      phaseLabel,
    };
  }

  return {
    from: validVol || validDonor,
    to: validDonor,
    routeType: 'volunteer_to_donor',
    phaseLabel: 'Heading to Donor Pickup',
  };
};

export default {
  validateCoordinates,
  formatDistance,
  formatDuration,
  snapToNearestRoad,
  fetchOSRMRoute,
  determineActiveRoute,
};
