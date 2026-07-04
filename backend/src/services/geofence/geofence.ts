export interface GeoPoint {
  lat: number
  lng: number
}

function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export interface GeofenceResult {
  valid: boolean
  distanceM: number
  thresholdM: number
  variance: 'within' | 'out_of_bounds' | 'edge'
}

export function validateGeofence(
  worker: GeoPoint,
  site: GeoPoint,
  radiusM: number,
): GeofenceResult {
  const distanceM = haversineDistance(worker, site)
  let variance: GeofenceResult['variance'] = 'within'
  if (distanceM > radiusM) variance = 'out_of_bounds'
  else if (distanceM > radiusM * 0.9) variance = 'edge'
  return { valid: distanceM <= radiusM, distanceM: Math.round(distanceM), thresholdM: radiusM, variance }
}
