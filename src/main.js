import { MapView } from './map.js';
import {
  Simulation,
  RouteGeom,
  saveCustomRoute,
  allRouteDefs,
} from './simulation.js';
import { SAMPLE_ROUTES } from './routes.js';
import { loadStations } from './stations.js';
import { initUI } from './ui.js';

const mapView = new MapView(document.getElementById('map'));
const sim = new Simulation();
sim.speedMultiplier = 10;

// ------------------------------------------------------------------ routes
let routeGeoms = new Map();

function rebuildRoutes() {
  routeGeoms = new Map();
  const geoms = [];
  const stations = [];
  for (const def of allRouteDefs(SAMPLE_ROUTES)) {
    try {
      const g = new RouteGeom(def);
      routeGeoms.set(g.id, g);
      geoms.push(g);
      stations.push(...g.stationsGeoJSON());
    } catch (err) {
      console.warn(`Skipping invalid route "${def.name}":`, err.message);
    }
  }
  mapView.setRouteData(geoms, stations);
  return geoms;
}

rebuildRoutes();

// Bangladesh Railway stations (entries without coordinates are skipped).
loadStations()
  .then((geojson) => mapView.setBrStationData(geojson))
  .catch((err) => console.warn('Could not load stations:', err));

const app = {
  mapView,
  sim,
  routes: () => [...routeGeoms.values()],
  routeById: (id) => routeGeoms.get(id),
  addCustomRoute(def) {
    saveCustomRoute(def);
    rebuildRoutes();
    ui.refreshRoutes();
  },
};

const ui = initUI(app);

// ------------------------------------------------------------- simulation loop
// Fixed-ish timestep clamped to avoid jumps after tab throttling.
let last = performance.now();
let uiAccumulator = 0;

function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;

  sim.tick(dt);
  mapView.updateTrains(sim.headsCollection(), sim.trailsCollection());

  uiAccumulator += dt;
  if (uiAccumulator > 0.25) {
    uiAccumulator = 0;
    ui.refreshTrainList();
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Demo: start one train on the busiest corridor so the map isn't empty.
mapView.ready.then(() => {
  const geom = routeGeoms.get('dhaka-chattogram');
  if (geom) {
    const t = sim.addTrain(geom, { startOffsetKm: geom.totalKm * 0.35 });
    t.name = 'Subarna Express';
    ui.refreshTrainList();
    mapView.fitToRoute(geom);
  }
});
