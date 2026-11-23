// Loads Bangladesh Railway stations from data/stations.json and converts
// them to a GeoJSON FeatureCollection. Entries missing coordinates are skipped.
export async function loadStations(url = 'data/stations.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const json = await res.json();
  const rows = Array.isArray(json) ? json : json.data || [];

  const features = rows
    .filter(
      (s) =>
        typeof s.latitude === 'number' &&
        typeof s.longitude === 'number' &&
        Number.isFinite(s.latitude) &&
        Number.isFinite(s.longitude)
    )
    .map((s) => ({
      type: 'Feature',
      properties: {
        id: s.station_id,
        code: s.code || '',
        name: s.name || '',
        nameBn: s.name_bn || '',
      },
      geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
    }));

  return { type: 'FeatureCollection', features };
}
