import { BASEMAPS, OVERLAYS, RAIL_EMPHASIS } from './config.js';

const $ = (sel) => document.querySelector(sel);

export function initUI(app) {
  const { mapView, sim } = app;

  // ------------------------------------------------------------- basemap select
  const basemapSelect = $('#basemap-select');
  const groups = [...new Set(BASEMAPS.map((b) => b.group))];
  for (const g of groups) {
    const og = document.createElement('optgroup');
    og.label = g;
    for (const b of BASEMAPS.filter((x) => x.group === g)) {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.label;
      if (b.id === mapView.basemapId) opt.selected = true;
      og.appendChild(opt);
    }
    basemapSelect.appendChild(og);
  }
  basemapSelect.addEventListener('change', () => mapView.setBasemap(basemapSelect.value));

  // ------------------------------------------------------------ overlay checkboxes
  const overlayList = $('#overlay-list');
  for (const o of OVERLAYS) {
    const label = document.createElement('label');
    label.className = 'overlay-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = mapView.overlayState.get(o.id) ?? false;
    cb.addEventListener('change', () => mapView.setOverlay(o.id, cb.checked));
    const text = document.createElement('span');
    text.textContent = o.label;
    label.append(cb, text);
    if (o.warn) {
      const warn = document.createElement('span');
      warn.className = 'warn';
      warn.textContent = ` (${o.warn})`;
      label.appendChild(warn);
    }
    overlayList.appendChild(label);
  }

  // Rail emphasis toggle (vector basemaps only — applied automatically).
  const railLabel = document.createElement('label');
  railLabel.className = 'overlay-item';
  const railCb = document.createElement('input');
  railCb.type = 'checkbox';
  railCb.checked = true;
  railCb.addEventListener('change', () => {
    // Toggle by re-rendering; simplest is to let mapView respect a flag.
    mapView.railEmphasisEnabled = railCb.checked;
    mapView._rebuildDynamicLayers();
  });
  const railText = document.createElement('span');
  railText.textContent = RAIL_EMPHASIS.label;
  railLabel.append(railCb, railText);
  overlayList.appendChild(railLabel);

  // BR stations from data/stations.json.
  const stLabel = document.createElement('label');
  stLabel.className = 'overlay-item';
  const stCb = document.createElement('input');
  stCb.type = 'checkbox';
  stCb.checked = mapView.brStationsVisible;
  stCb.addEventListener('change', () => mapView.setBrStationsVisible(stCb.checked));
  const stText = document.createElement('span');
  stText.textContent = 'BR stations (data/stations.json)';
  stLabel.append(stCb, stText);
  overlayList.appendChild(stLabel);

  // --------------------------------------------------------------- sim controls
  const simToggle = $('#sim-toggle');
  const simSpeed = $('#sim-speed');
  const simSpeedValue = $('#sim-speed-value');

  simSpeed.addEventListener('input', () => {
    sim.speedMultiplier = Number(simSpeed.value);
    simSpeedValue.textContent = simSpeed.value;
  });

  simToggle.addEventListener('click', () => {
    sim.toggleAll();
    simToggle.textContent = sim.running ? 'Pause all' : 'Resume all';
    simToggle.classList.toggle('primary', sim.running);
  });

  // --------------------------------------------------------------- route select
  const routeSelect = $('#route-select');
  function rebuildRouteSelect() {
    routeSelect.innerHTML = '';
    for (const r of app.routes()) {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `${r.name} (${r.waypoints.length} pts)`;
      routeSelect.appendChild(opt);
    }
  }
  rebuildRouteSelect();

  $('#add-train').addEventListener('click', () => {
    const geom = app.routeById(routeSelect.value);
    if (!geom) return;
    sim.addTrain(geom);
    refreshTrainList();
    fitToFirstTrain(geom);
  });

  function fitToFirstTrain(geom) {
    if (sim.trains.length === 1) mapView.fitToRoute(geom);
  }

  // --------------------------------------------------------------- train list
  const trainList = $('#train-list');
  const itemEls = new Map(); // trainId -> li element

  function refreshTrainList() {
    // Remove stale items.
    for (const [id, el] of itemEls) {
      if (!sim.trains.find((t) => t.id === id)) {
        el.remove();
        itemEls.delete(id);
      }
    }

    for (const t of sim.trains) {
      let el = itemEls.get(t.id);
      if (!el) {
        el = document.createElement('li');
        el.className = 'train-item';
        el.innerHTML = `
          <div class="row">
            <span class="dot"></span>
            <span class="name"></span>
            <button class="btn locate" title="Center on train">⌖</button>
          </div>
          <div class="meta"></div>
          <div class="actions">
            <button class="btn pause"></button>
            <button class="btn remove">Remove</button>
          </div>`;
        el.querySelector('.pause').addEventListener('click', () => {
          t.paused = !t.paused;
          refreshTrainList();
        });
        el.querySelector('.remove').addEventListener('click', () => {
          sim.removeTrain(t.id);
          refreshTrainList();
        });
        el.querySelector('.locate').addEventListener('click', () => {
          if (t.position) {
            mapView.map.flyTo({ center: [t.position.lng, t.position.lat], zoom: Math.max(mapView.map.getZoom(), 9), duration: 800 });
          }
        });
        itemEls.set(t.id, el);
        trainList.appendChild(el);
      }

      el.classList.toggle('paused', t.paused || t.finished);
      el.querySelector('.dot').style.background = t.color;
      el.querySelector('.name').textContent = t.name;
      const meta = el.querySelector('.meta');
      if (t.position) {
        meta.textContent =
          `${Math.round(t.position.speedKmh)} km/h · ${Math.round(t.progress * 100)}% · ` +
          `${t.position.lat.toFixed(3)}, ${t.position.lng.toFixed(3)}`;
      } else {
        meta.textContent = 'Route complete';
      }
      const pauseBtn = el.querySelector('.pause');
      pauseBtn.textContent = t.paused ? 'Resume' : 'Pause';
    }
  }

  // ------------------------------------------------------------------ draw mode
  const drawToggle = $('#draw-toggle');
  const drawActions = $('#draw-actions');
  const drawHint = $('#draw-hint');
  let drawing = false;

  drawToggle.addEventListener('click', () => {
    drawing = !drawing;
    drawToggle.textContent = drawing ? 'Stop drawing' : 'Start drawing';
    drawActions.hidden = !drawing;
    drawHint.hidden = !drawing;
    mapView.setDrawHandler(drawing ? () => {} : null);
    if (!drawing) {
      mapView.clearDraw();
    }
  });

  $('#draw-undo').addEventListener('click', () => mapView.undoDrawPoint());
  $('#draw-cancel').addEventListener('click', () => {
    mapView.clearDraw();
    drawToggle.click(); // exits draw mode
  });

  $('#draw-finish').addEventListener('click', () => {
    const pts = mapView.getDrawPoints();
    if (pts.length < 2) return;
    const name = window.prompt('Route name:', 'Custom route');
    if (!name) return;

    const colors = ['#0ea5e9', '#f97316', '#84cc16', '#ec4899', '#14b8a6'];
    const def = {
      id: `custom-${Date.now()}`,
      name,
      color: colors[app.routes().length % colors.length],
      loop: false,
      waypoints: pts,
      speeds: 80,
      stations: [],
    };
    app.addCustomRoute(def);

    // Keep drawing mode off and zoom to the new route.
    drawToggle.click();
    const geom = app.routeById(def.id);
    if (geom) mapView.fitToRoute(geom);
    sim.addTrain(geom);
    refreshTrainList();
    refreshRouteSelectPublic();
  });

  function refreshRouteSelectPublic() {
    rebuildRouteSelect();
  }

  // ------------------------------------------------------------- public refresh
  return {
    refreshTrainList,
    refreshRoutes: rebuildRouteSelect,
  };
}
