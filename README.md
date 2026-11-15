# MarsWalk — EVA planner for the Gale Crater boxwork

A layered, hyper-local map and route planner a Mars crew could use to plan and walk a
surface excursion on Mount Sharp's boxwork ridges — the terrain Curiosity has been
exploring since 2025. It fuses seven NASA data sets into one 3.2 km × 3.2 km view and
turns them into a slope-safe route, a timeline, and go/no-go checks.

## Run it

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765. No build step, no API keys. It is a static site
(`index.html`, `app.js`, `data/`), so it can be hosted on any static host as-is.

## What it does

- **Two views of one plan.** *Habitat planner* (full layer controls, route editing,
  go/no-go) and *Helmet HUD* (next waypoint, heading, slope ahead, consumables,
  return-to-hab time, dose) with a walk-through simulation.
- **Slope-aware routing.** A* over the HiRISE elevation grid. Cost is travel time
  (Tobler hiking function, scaled for a suited walker or an unpressurised rover) times a
  slope-risk penalty; ground steeper than the chosen limit is impassable. The route goes
  Habitat → ordered stations → Habitat.
- **Science stations with ground truth.** Eight stations are real Curiosity stops in the
  boxwork unit. Each opens the Mastcam/Navcam frames the rover took there, so the crew
  sees the ground before arriving. Click anywhere to add custom waypoints.
- **Safety checks.** Consumables margin, daylight (REMS sunrise/sunset), steepest ground,
  walk-back distance, live space-weather status, ground/air temperature.
- **Habitat siting.** The default base is snapped to the flattest 20 m patch nearby; drag
  it to re-plan.

### Mission, team and survival tools

- **Mission setup.** Max walkable slope, rover assist (capped at 15°), and three
  science targets you can toggle: *Boxwork ridge edge* (stations E–G), *Sulfate
  terrace* (station D) and *Scarp viewpoint* (the highest gently sloped point within
  450 m of the hab, found from the elevation model). The grouping of stations into
  targets is our own choice for the demo.
- **Time of day at Gale.** Sets the egress time. It computes sun elevation and azimuth
  from the season (Ls) and local solar time, estimates ground temperature from REMS,
  shows the dose rate, and redraws a "Sunlight at egress time" layer. That layer shades
  by slope facing only; it does not model cast shadows.
- **Team plan.** Split the stops between two astronauts by direction from the hab, and
  optionally let astronaut B drive the rover. Each gets their own route (cyan / orange).
- **Crew status and survival advisor.** Enter oxygen left, crew size, injury, suit
  fault and solar-storm alert, and mark the crew's position on the map (default: the
  farthest point of the route). *Get guidance* routes back to the hab and compares the
  walk-back time with oxygen. Injury halves pace and prefers slopes under 12°; a suit
  fault cuts usable time by a third. *Guard mode* finds the fastest shelter: the hab,
  or a partly sheltered spot at the base of steep terrain if that is quicker. *Visor
  view* opens the HUD. *Route card* opens a printable leg-by-leg card with headings,
  climb, max slope and arrival times.

## Data layers (7 kinds, 6 missions)

| Kind | Layer | Source |
|---|---|---|
| Optical | HiRISE 25 cm mosaic, CTX mosaic, Viking colour | MRO, Viking — NASA Mars Trek tiles |
| Topographic | Elevation, 10 m contours, slope hazard | MSL Gale DEM Mosaic 1 m v3 (MRO HiRISE, USGS Astrogeology) |
| Thermal | THEMIS day and night IR | Mars Odyssey — Mars Trek tiles |
| Atmospheric | Air/ground temperature, pressure, UV, opacity, sunrise/sunset | MSL REMS feed |
| Radiation | Surface GCR dose rate 0.67 mSv/day | MSL RAD (Hassler et al., 2014) |
| Space weather | Flare, CME and SEP alerts, last 7 days (live) | NASA CCMC DONKI; flare class from NOAA GOES |
| Ground imagery + path | Rover traverse to sol 5073, raw images per station | MSL localisation and raw-image archive |

`data/dem.bin` is an 800 × 800 grid (4 m cells) cut from the 1 m DEM; `data/mission.js`
holds the traverse, stations, image links and the last 90 REMS sols. Map tiles, images
and space weather load live.

## Honest limits

- The DEM is averaged to 4 m, so slope shows hills and scarps, not individual rocks.
  Rock-scale hazard would need HiRISE rock-abundance maps or onboard sensing.
- Walking speed (0.8 m/s flat), rover speed, walk-back guides and the 8 h consumables
  default are planning assumptions, not flight rules. All are adjustable.
- Dose is the long-term GCR average times EVA time. DONKI alerts are heliosphere-wide,
  not Mars-directed forecasts, so the status is a prompt to check, not a prediction.
- REMS values are the latest sol in the public feed, not a forecast. HUD ground
  temperature is interpolated between that sol's min and max.
- THEMIS is 100 m/px — context for surface texture, not a per-step traction map.
- HUD position is simulated along the route; there is no live positioning.
- The survival advisor's rules (injured pace, suit-fault penalty, 30-minute shelter
  threshold) are illustrative, not NASA procedures. Terrain shelters only block part of
  the sky, so they reduce exposure from those directions only.

## Credits

NASA/JPL-Caltech, MSSS, University of Arizona, USGS Astrogeology, Arizona State
University, NASA CCMC, NOAA SWPC. Map library: Leaflet.
