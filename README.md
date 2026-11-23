# BD Train Live Location Simulator

A zero-cost, no-build-step web app for simulating Bangladesh Railway train
live locations on an interactive map. Built with **MapLibre GL JS v6** and
free tile sources only — no API keys, no accounts.

## Run it

Any static file server works (ES modules require http://, not file://):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

or `npx serve .`

## Map sources (all free)

| Source | Type | Notes |
|---|---|---|
| OpenFreeMap | vector basemap | 5 styles (Positron, Bright, Liberty, Dark, Fiord). Free public instance, no view limits. OSM data. |
| Esri | raster basemap | World Street Map / Topographic / Imagery. Free with attribution. |
| OpenRailwayMap | raster overlay | Standard rail lines + level-crossing hazards. Attribution required. |
| OpenStreetMap | raster overlay | Standard OSM tiles — **not for heavy production use** per OSM tile policy. |
| Esri Hillshade | raster overlay | Terrain shading. |

On vector basemaps a custom **rail emphasis** layer thickens rail lines from
the OpenMapTiles `transportation` layer for extra detail.

> Production note: for real production traffic, prefer self-hosting OpenFreeMap
> (they publish weekly PMTiles/MBTiles planet downloads) or Esri's paid tiers.
> The public OpenFreeMap instance is free but donation-funded.

## Simulation engine (`src/simulation.js`)

- **Routes** are waypoint polylines (`[lon, lat]`) with per-segment speeds in
  km/h. Distances use haversine; positions interpolate along segments.
- **Trains** have heading, speed, progress %, a capped recent trail, and can
  be paused individually. Non-loop trains stop at the terminus.
- **Global sim speed** 1–120x via the slider.
- **Custom routes**: click "Start drawing", click waypoints on the map,
  "Finish" names the route — saved to `localStorage` and reloaded on start.

## Files

```
index.html          UI shell + import map (CDN deps)
styles.css          panel styling
src/config.js       basemap/overlay definitions + raster style builder
src/routes.js       sample Bangladesh Railway corridors (edit me)
src/simulation.js   RouteGeom, Train, Simulation, custom-route storage
src/map.js          MapLibre setup, style/overlay/layer management, popups
src/ui.js           side-panel wiring
src/main.js         bootstrap + animation loop
```

## Adding routes

Edit `src/routes.js` — each entry needs `id`, `name`, `color`, `waypoints`,
optional `speeds` (scalar or per-segment array), `loop`, and `stations`.
Waypoints are approximate corridor alignments; for production accuracy snap
them to real track geometry from OSM `railway=rail` ways.

## Roadmap ideas

- Real BD Railway timetable data + delay simulation
- GPX/GeoJSON route import
- Multiple consists per train, rake reversal at terminals
- WebSocket feed to stream simulated positions to other clients
- Offline PMTiles basemap for low-connectivity use
