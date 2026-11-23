// ---------------------------------------------------------------------------
// Route geometry + train simulation engine.
//
// Routes are polylines of [lon, lat] waypoints. Distances are computed with a
// haversine (great-circle) formula; positions along a segment are interpolated
// linearly in lon/lat space, which is accurate enough for visual simulation.
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371.0088;
const RAD = Math.PI / 180;
const KMH_TO_KM_S = 1 / 3600;

const CUSTOM_ROUTES_KEY = 'train-sim.custom-routes';

export function haversineKm(a, b) {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const lat1 = a[1] * RAD;
  const lat2 = b[1] * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Initial bearing from a to b, degrees clockwise from north (0-360).
export function bearingDeg(a, b) {
  const lat1 = a[1] * RAD;
  const lat2 = b[1] * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

// ---------------------------------------------------------------------------
// Route geometry: precomputed cumulative distances + point lookup.
// ---------------------------------------------------------------------------
export class RouteGeom {
  constructor(def) {
    this.id = def.id;
    this.name = def.name;
    this.color = def.color || '#2563eb';
    this.loop = Boolean(def.loop);
    this.waypoints = def.waypoints.map(([lon, lat]) => [lon, lat]);

    if (this.waypoints.length < 2) {
      throw new Error(`Route "${this.name}" needs at least 2 waypoints`);
    }

    // Segment lengths in km.
    this.segments = [];
    let total = 0;
    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const len = haversineKm(this.waypoints[i], this.waypoints[i + 1]);
      this.segments.push(len);
      total += len;
    }
    this.totalKm = total;

    // Cumulative distance at the start of each segment.
    this.cumulative = [0];
    for (const len of this.segments) this.cumulative.push(this.cumulative.at(-1) + len);

    // Per-segment speed (km/h). Scalar speeds apply to all segments.
    const speeds = Array.isArray(def.speeds) ? def.speeds : null;
    this.speedsKmh = this.segments.map((_, i) =>
      speeds ? (speeds[i] ?? speeds.at(-1) ?? 80) : (typeof def.speeds === 'number' ? def.speeds : 80)
    );

    this.stations = (def.stations || []).map((s) => {
      const km = typeof s.at === 'number' && s.at < this.waypoints.length
        ? this.cumulative[s.at]
        : Number(s.at);
      return { name: s.name, km: Number.isFinite(km) ? km : 0 };
    });
  }

  segmentIndexAt(km) {
    // Binary search for the segment containing distance km.
    let lo = 0;
    let hi = this.segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cumulative[mid] <= km) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  // Position + heading at distance km along the route.
  // Returns null if the route is finished (non-loop) and km is past the end.
  pointAt(km) {
    const total = this.totalKm;
    let d = km;
    if (this.loop) {
      d = ((d % total) + total) % total;
    } else if (d < 0) {
      d = 0;
    } else if (d > total) {
      return null;
    }

    const i = this.segmentIndexAt(d);
    const segStart = this.cumulative[i];
    const segLen = this.segments[i];
    const t = segLen > 0 ? (d - segStart) / segLen : 0;
    const a = this.waypoints[i];
    const b = this.waypoints[i + 1];
    const lon = a[0] + (b[0] - a[0]) * t;
    const lat = a[1] + (b[1] - a[1]) * t;
    const heading = bearingDeg(a, b);
    const speedKmh = this.speedsKmh[i];
    return { lng: lon, lat, heading, speedKmh, segmentIndex: i, progress: d / total, distanceKm: d };
  }

  toGeoJSON() {
    return {
      type: 'Feature',
      properties: { id: this.id, name: this.name, color: this.color },
      geometry: { type: 'LineString', coordinates: this.waypoints },
    };
  }

  stationsGeoJSON() {
    return this.stations.map((s) => {
      const p = this.pointAt(Math.min(s.km, this.totalKm));
      if (!p) return null;
      return {
        type: 'Feature',
        properties: { name: s.name, route: this.name, color: this.color },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      };
    }).filter(Boolean);
  }
}

// ---------------------------------------------------------------------------
// Train: moves along a RouteGeom.
// ---------------------------------------------------------------------------
const TRAIL_STEP_KM = 0.2;
const TRAIL_MAX_POINTS = 1500;

let trainCounter = 0;

export class Train {
  constructor(routeGeom, { name, startOffsetKm = 0 } = {}) {
    this.id = `train-${++trainCounter}`;
    this.route = routeGeom;
    this.name = name || `${routeGeom.name} ${trainCounter}`;
    this.color = routeGeom.color;
    this.paused = false;
    this.finished = false;
    this.distanceKm = startOffsetKm % routeGeom.totalKm;
    this.trail = [];
    this._lastTrailKm = this.distanceKm;
    this.position = routeGeom.pointAt(this.distanceKm);
    this._seedTrail();
  }

  _seedTrail() {
    if (!this.position) return;
    this.trail = [[this.position.lng, this.position.lat]];
    this._lastTrailKm = this.distanceKm;
  }

  get progress() {
    return this.position ? this.position.progress : 0;
  }

  // dtSeconds is real elapsed time; simSpeed multiplies it.
  update(dtSeconds, simSpeed) {
    if (this.paused || this.finished || !this.position) return;
    const effectiveDt = dtSeconds * simSpeed;
    this.distanceKm += this.position.speedKmh * KMH_TO_KM_S * effectiveDt;

    if (!this.route.loop && this.distanceKm >= this.route.totalKm) {
      this.distanceKm = this.route.totalKm;
      this.finished = true;
      this.position = this.route.pointAt(this.distanceKm);
      return;
    }

    this.position = this.route.pointAt(this.distanceKm);
    if (!this.position) {
      this.finished = true;
      return;
    }

    if (Math.abs(this.distanceKm - this._lastTrailKm) >= TRAIL_STEP_KM) {
      this.trail.push([this.position.lng, this.position.lat]);
      if (this.trail.length > TRAIL_MAX_POINTS) {
        this.trail.splice(0, this.trail.length - TRAIL_MAX_POINTS);
      }
      this._lastTrailKm = this.distanceKm;
    }
  }

  headFeature() {
    if (!this.position) return null;
    return {
      type: 'Feature',
      properties: {
        id: this.id,
        name: this.name,
        color: this.color,
        heading: this.position.heading,
        speedKmh: Math.round(this.position.speedKmh),
        progress: Math.round(this.progress * 100),
        paused: this.paused,
        finished: this.finished,
      },
      geometry: { type: 'Point', coordinates: [this.position.lng, this.position.lat] },
    };
  }

  trailFeature() {
    if (this.trail.length < 2) return null;
    return {
      type: 'Feature',
      properties: { id: this.id, name: this.name, color: this.color },
      geometry: { type: 'LineString', coordinates: this.trail },
    };
  }
}

// ---------------------------------------------------------------------------
// Route registry: sample routes + user-drawn routes persisted in localStorage.
// ---------------------------------------------------------------------------
export function loadCustomRoutes() {
  try {
    const raw = localStorage.getItem(CUSTOM_ROUTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomRoute(def) {
  const routes = loadCustomRoutes();
  routes.push(def);
  localStorage.setItem(CUSTOM_ROUTES_KEY, JSON.stringify(routes));
  return def;
}

export function deleteCustomRoute(id) {
  const routes = loadCustomRoutes().filter((r) => r.id !== id);
  localStorage.setItem(CUSTOM_ROUTES_KEY, JSON.stringify(routes));
}

export function allRouteDefs(sampleRoutes) {
  const custom = loadCustomRoutes().map((d) => ({ ...d, custom: true }));
  return [...sampleRoutes, ...custom];
}

// ---------------------------------------------------------------------------
// Simulation: owns all trains and advances them on a fixed timestep.
// ---------------------------------------------------------------------------
export class Simulation {
  constructor() {
    this.trains = [];
    this.running = true;
    this.speedMultiplier = 10;
  }

  addTrain(routeGeom, opts = {}) {
    const train = new Train(routeGeom, opts);
    this.trains.push(train);
    return train;
  }

  removeTrain(id) {
    this.trains = this.trains.filter((t) => t.id !== id);
  }

  toggleAll() {
    this.running = !this.running;
    return this.running;
  }

  tick(dtSeconds) {
    if (!this.running) return;
    for (const t of this.trains) t.update(dtSeconds, this.speedMultiplier);
  }

  // GeoJSON collections for rendering.
  headsCollection() {
    return {
      type: 'FeatureCollection',
      features: this.trains.map((t) => t.headFeature()).filter(Boolean),
    };
  }

  trailsCollection() {
    return {
      type: 'FeatureCollection',
      features: this.trains.map((t) => t.trailFeature()).filter(Boolean),
    };
  }
}
