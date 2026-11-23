import { Map as MapLibreMap, NavigationControl, ScaleControl, FullscreenControl, Popup, Marker, LngLatBounds, setWorkerUrl } from 'maplibre-gl';
import { BASEMAPS, OVERLAYS, RAIL_EMPHASIS, styleForBasemap, isVectorBasemap } from './config.js';

setWorkerUrl('https://cdn.jsdelivr.net/npm/maplibre-gl@6.19.0/dist/maplibre-gl-worker.mjs');

const OVERLAY_ORDER = ['esri-hillshade', 'osm-raster', 'openrailwaymap', 'openrailwaymap-hazard'];
const OVERLAY_BY_ID = Object.fromEntries(OVERLAYS.map((o) => [o.id, o]));
const BASEMAP_BY_ID = Object.fromEntries(BASEMAPS.map((b) => [b.id, b]));

// Dynamic layer stack, added after every style (re)load, in this order:
//   rail emphasis → overlay rasters → route lines → stations → trails → heads
const ROUTE_LAYERS = [
  {
    id: 'route-lines', type: 'line', source: 'route-lines',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 2.5,
      'line-opacity': 0.65,
      'line-dasharray': [2, 1.6],
    },
  },
];

const STATION_LAYERS = [
  {
    id: 'station-dots', type: 'circle', source: 'stations',
    paint: {
      'circle-radius': 4.5,
      'circle-color': ['get', 'color'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.6,
    },
  },
  {
    id: 'station-labels', type: 'symbol', source: 'stations',
    layout: {
      'text-field': ['get', 'name'],
      'text-size': 11,
      'text-offset': [0, 0.9],
      'text-anchor': 'top',
      'text-font': ['Noto Sans Regular'],
    },
    paint: { 'text-color': '#334155', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
  },
];

const BR_STATION_LAYERS = [
  {
    id: 'br-station-dots', type: 'circle', source: 'br-stations', minzoom: 5,
    paint: {
      'circle-radius': 3.5,
      'circle-color': '#0f766e',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.2,
    },
  },
  {
    id: 'br-station-labels', type: 'symbol', source: 'br-stations', minzoom: 8.5,
    layout: {
      'text-field': ['get', 'name'],
      'text-size': 10.5,
      'text-offset': [0, 0.7],
      'text-anchor': 'top',
      'text-font': ['Noto Sans Regular'],
      'text-optional': true,
    },
    paint: { 'text-color': '#115e59', 'text-halo-color': '#ffffff', 'text-halo-width': 1.3 },
  },
];

const TRAIN_LAYERS = [
  {
    id: 'train-trails', type: 'line', source: 'trails',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 3,
      'line-opacity': 0.45,
      'line-gradient': undefined, // replaced below; gradient needs lineMetrics
    },
  },
  {
    id: 'train-dots', type: 'circle', source: 'trains-heads',
    paint: {
      'circle-radius': 7,
      'circle-color': ['get', 'color'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2.2,
    },
  },
  {
    id: 'train-arrows', type: 'symbol', source: 'trains-heads',
    layout: {
      'icon-image': 'train-arrow',
      'icon-size': 0.55,
      'icon-rotate': ['get', 'heading'],
      'icon-rotation-alignment': 'viewport',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  },
  {
    id: 'train-labels', type: 'symbol', source: 'trains-heads',
    layout: {
      'text-field': ['get', 'name'],
      'text-size': 11,
      'text-offset': [0, 1.4],
      'text-anchor': 'top',
      'text-font': ['Noto Sans Regular'],
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  },
];

// Small arrow glyph pointing north; rotated per-train by heading.
function makeArrowImage() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.translate(size / 2, size / 2);
  ctx.beginPath();
  ctx.moveTo(0, -12); // tip (north)
  ctx.lineTo(8, 6);
  ctx.lineTo(3, 6);
  ctx.lineTo(3, 12);
  ctx.lineTo(-3, 12);
  ctx.lineTo(-3, 6);
  ctx.lineTo(-8, 6);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#0f172a';
  ctx.stroke();
  return { data: ctx.getImageData(0, 0, size, size), width: size, height: size };
}

export class MapView {
  constructor(container, { basemapId = 'ofm-liberty' } = {}) {
    this.container = container;
    this.basemapId = basemapId;
    this.overlayState = new Map(OVERLAYS.map((o) => [o.id, o.id === 'openrailwaymap']));
    this.overlayLayersAdded = false;
    this.routeData = { routes: [], stations: [] };
    this.trainData = { heads: null, trails: null };
    this.railEmphasisEnabled = true;
    this.brStationsData = { type: 'FeatureCollection', features: [] };
    this.brStationsVisible = true;
    this._drawHandler = null;
    this._drawPoints = [];
    this._drawMarker = null;

    this.map = new MapLibreMap({
      container,
      style: styleForBasemap(BASEMAP_BY_ID[basemapId]),
      center: [90.35, 23.85], // Bangladesh
      zoom: 6.5,
      minZoom: 2,
      maxZoom: 22,
      antialias: true,
      hash: true,
      attributionControl: { compact: true },
    });

    this.map.addControl(new NavigationControl({ visualizePitch: true, showCompass: true }), 'top-right');
    this.map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
    this.map.addControl(new FullscreenControl(), 'top-right');

    this.map.on('style.load', () => this._rebuildDynamicLayers());
    this.map.on('load', () => {
      this.map.addImage('train-arrow', makeArrowImage());
      this._initDrawSource();
      this._rebuildDynamicLayers();
    });
    this.map.on('click', (e) => this._onMapClick(e));
    this.map.on('click', 'train-dots', (e) => this._onTrainClick(e));
    this.map.on('click', 'br-station-dots', (e) => this._onStationClick(e));
  }

  get ready() {
    return new Promise((resolve) => {
      if (this.map.loaded()) resolve();
      else this.map.once('load', resolve);
    });
  }

  // ------------------------------------------------------------------ basemaps

  setBasemap(id) {
    const bm = BASEMAP_BY_ID[id];
    if (!bm) return;
    this.basemapId = id;
    this.map.setStyle(styleForBasemap(bm), { diff: false });
    // style.load re-adds every dynamic layer (see _rebuildDynamicLayers).
  }

  setOverlay(id, enabled) {
    this.overlayState.set(id, enabled);
    this._rebuildOverlayLayers();
  }

  // ------------------------------------------------------------- dynamic layers

  _insertBeforeLabel(layer) {
    const layers = this.map.getStyle().layers || [];
    const firstSymbol = layers.find((l) => l.type === 'symbol')?.id;
    this.map.addLayer(layer, firstSymbol);
  }

  _rebuildDynamicLayers() {
    if (!this.map.isStyleLoaded()) return;
    if (!this.map.hasImage('train-arrow')) {
      this.map.addImage('train-arrow', makeArrowImage());
    }
    this._ensureSources();
    this._rebuildRailEmphasis();
    this._rebuildOverlayLayers();
    this._rebuildRouteLayers();
    this._rebuildTrainLayers();
    this._rebuildBrStationLayers();
    this._applyRouteData();
    this._applyTrainData();
    this._restoreDrawOverlay();
  }

  _ensureSources() {
    const add = (id, data) => {
      if (!this.map.getSource(id)) {
        this.map.addSource(id, { type: 'geojson', data });
      }
    };
    add('route-lines', { type: 'FeatureCollection', features: [] });
    add('stations', { type: 'FeatureCollection', features: [] });
    add('trails', { type: 'FeatureCollection', features: [] });
    add('trains-heads', { type: 'FeatureCollection', features: [] });
    add('draw-preview', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    add('br-stations', { type: 'geojson', data: this.brStationsData });
  }

  _removeLayerIfExists(id) {
    if (this.map.getLayer(id)) this.map.removeLayer(id);
  }

  _removeSourceIfExists(id) {
    if (this.map.getSource(id)) this.map.removeSource(id);
  }

  _rebuildRailEmphasis() {
    this._removeLayerIfExists(RAIL_EMPHASIS.id);
    if (!this.railEmphasisEnabled) return;
    const bm = BASEMAP_BY_ID[this.basemapId];
    if (!isVectorBasemap(bm)) return;

    // OpenMapTiles-based styles expose a 'transportation' source layer.
    const layers = this.map.getStyle().layers || [];
    const transportLayer = layers.find((l) => l['source-layer'] === 'transportation');
    if (!transportLayer) return;

    this._insertBeforeLabel({
      id: RAIL_EMPHASIS.id,
      type: 'line',
      source: transportLayer.source,
      'source-layer': 'transportation',
      filter: ['all',
        ['==', ['get', 'class'], 'rail'],
        ['!=', ['get', 'brunnel'], 'tunnel'],
      ],
      paint: {
        'line-color': '#7c3aed',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 14, 1.6, 18, 3],
        'line-opacity': 0.85,
      },
    });
  }

  _rebuildOverlayLayers() {
    // Remove previously added overlay layers/sources.
    for (const o of OVERLAYS) {
      this._removeLayerIfExists(`overlay-${o.id}`);
      this._removeSourceIfExists(`overlay-${o.id}`);
    }
    if (!this.map.isStyleLoaded()) return;

    for (const id of OVERLAY_ORDER) {
      if (!this.overlayState.get(id)) continue;
      const o = OVERLAY_BY_ID[id];
      const sourceId = `overlay-${id}`;
      const layerId = `overlay-${id}`;
      if (this.map.getSource(sourceId)) continue;

      this.map.addSource(sourceId, {
        type: 'raster',
        tiles: o.tiles,
        tileSize: 256,
        maxzoom: o.maxzoom ?? 19,
        subdomains: o.subdomains,
        attribution: o.attribution,
      });
      this._insertBeforeLabel({
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: { 'raster-fade-duration': 200, 'raster-opacity': id === 'esri-hillshade' ? 0.5 : 1 },
      });
    }
    this.overlayLayersAdded = true;
  }

  _rebuildRouteLayers() {
    for (const l of ROUTE_LAYERS) this._removeLayerIfExists(l.id);
    for (const l of STATION_LAYERS) this._removeLayerIfExists(l.id);
    if (!this.map.isStyleLoaded()) return;
    for (const l of ROUTE_LAYERS) this._insertBeforeLabel({ ...l });
    for (const l of STATION_LAYERS) this._insertBeforeLabel({ ...l });
  }

  _rebuildTrainLayers() {
    for (const l of TRAIN_LAYERS) this._removeLayerIfExists(l.id);
    if (!this.map.isStyleLoaded()) return;
    for (const l of TRAIN_LAYERS) {
      const layer = { ...l };
      if (layer.id === 'train-trails') delete layer.paint['line-gradient']; // unsupported without lineMetrics
      this._insertBeforeLabel(layer);
    }
  }

  _restoreDrawOverlay() {
    if (this._drawHandler) {
      this._initDrawSource();
      this._refreshDrawLayer();
    }
  }

  // --------------------------------------------------------------- route data

  setRouteData(routes, stations) {
    this.routeData = { routes, stations };
    this._applyRouteData();
  }

  _applyRouteData() {
    const src = this.map.getSource('route-lines');
    if (src) src.setData({ type: 'FeatureCollection', features: this.routeData.routes.map((r) => r.toGeoJSON()) });
    const stSrc = this.map.getSource('stations');
    if (stSrc) stSrc.setData({ type: 'FeatureCollection', features: this.routeData.stations });
  }

  // --------------------------------------------------------------- train data

  updateTrains(heads, trails) {
    this.trainData = { heads, trails };
    this._applyTrainData();
  }

  _rebuildBrStationLayers() {
    for (const l of BR_STATION_LAYERS) this._removeLayerIfExists(l.id);
    if (!this.map.isStyleLoaded()) return;
    const visibility = this.brStationsVisible ? 'visible' : 'none';
    for (const l of BR_STATION_LAYERS) {
      this._insertBeforeLabel({ ...l, layout: { ...(l.layout || {}), visibility } });
    }
  }

  setBrStationData(geojson) {
    this.brStationsData = geojson;
    const src = this.map.getSource('br-stations');
    if (src) src.setData(geojson);
  }

  setBrStationsVisible(visible) {
    this.brStationsVisible = visible;
    for (const l of BR_STATION_LAYERS) {
      if (this.map.getLayer(l.id)) {
        this.map.setLayoutProperty(l.id, 'visibility', visible ? 'visible' : 'none');
      }
    }
  }

  _onStationClick(e) {
    const f = e.features?.[0];
    if (!f) return;
    const p = f.properties;
    new Popup({ offset: 10 })
      .setLngLat(e.lngLat)
      .setHTML(`
        <div style="font:13px system-ui;min-width:140px">
          <strong>${escapeHtml(p.name)}</strong><br/>
          ${p.nameBn ? escapeHtml(p.nameBn) + '<br/>' : ''}
          Code: ${escapeHtml(p.code)} · ID: ${p.id}
        </div>`)
      .addTo(this.map);
  }

  _applyTrainData() {
    const h = this.map.getSource('trains-heads');
    if (h && this.trainData.heads) h.setData(this.trainData.heads);
    const t = this.map.getSource('trails');
    if (t && this.trainData.trails) t.setData(this.trainData.trails);
  }

  // ------------------------------------------------------------------- popup

  _onTrainClick(e) {
    const f = e.features?.[0];
    if (!f) return;
    const p = f.properties;
    const popup = new Popup({ offset: 14, className: 'train-popup' })
      .setLngLat(e.lngLat)
      .setHTML(`
        <div style="font:13px system-ui;min-width:150px">
          <strong>${escapeHtml(p.name)}</strong><br/>
          Speed: ${p.speedKmh} km/h<br/>
          Progress: ${p.progress}%<br/>
          ${p.paused ? 'Paused' : p.finished ? 'Arrived' : 'Running'}
        </div>`)
      .addTo(this.map);
  }

  // --------------------------------------------------------------- draw mode

  setDrawHandler(fn) {
    this._drawHandler = fn;
    this.map.getCanvas().style.cursor = fn ? 'crosshair' : '';
  }

  _initDrawSource() {
    // draw-preview source was created in _ensureSources; add its layers once.
    if (this.map.getLayer('draw-line')) return;
    this._insertBeforeLabel({
      id: 'draw-line', type: 'line', source: 'draw-preview',
      paint: { 'line-color': '#f59e0b', 'line-width': 3, 'line-dasharray': [2, 1.5], 'line-opacity': 0.9 },
    });
    this._insertBeforeLabel({
      id: 'draw-points', type: 'circle', source: 'draw-preview',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 5, 'circle-color': '#f59e0b', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
    });
  }

  _onMapClick(e) {
    if (!this._drawHandler) return;
    this._drawPoints.push([e.lngLat.lng, e.lngLat.lat]);
    if (this._drawMarker) this._drawMarker.remove();
    this._drawMarker = new Marker({ color: '#f59e0b' }).setLngLat(e.lngLat).addTo(this.map);
    this._refreshDrawLayer();
    this._drawHandler([...this._drawPoints]);
  }

  _refreshDrawLayer() {
    const src = this.map.getSource('draw-preview');
    if (!src) return;
    const features = this._drawPoints.map(([lon, lat]) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [lon, lat] },
    }));
    if (this._drawPoints.length > 1) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: this._drawPoints },
      });
    }
    src.setData({ type: 'FeatureCollection', features });
  }

  getDrawPoints() {
    return [...this._drawPoints];
  }

  undoDrawPoint() {
    this._drawPoints.pop();
    this._refreshDrawLayer();
    return this._drawPoints.length;
  }

  clearDraw() {
    this._drawPoints = [];
    if (this._drawMarker) {
      this._drawMarker.remove();
      this._drawMarker = null;
    }
    const src = this.map.getSource('draw-preview');
    if (src) src.setData({ type: 'FeatureCollection', features: [] });
  }

  fitToRoute(routeGeom) {
    if (!routeGeom.waypoints.length) return;
    const bounds = new LngLatBounds();
    for (const [lon, lat] of routeGeom.waypoints) bounds.extend([lon, lat]);
    this.map.fitBounds(bounds, { padding: 80, maxZoom: 10, duration: 800 });
  }

  destroy() {
    this.map.remove();
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
