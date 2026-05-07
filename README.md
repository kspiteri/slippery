# slippery

Bergen bike route slipperiness checker — a PWA that tells you whether it's safe to cycle your commute today.

## What it does

Enter a from/to address (with optional waypoints) and it fetches:
- **Cycling route** via OpenRouteService (with surface type and elevation)
- **Weather** via MET Norway (overnight low, current temp, precipitation, active alerts)

It scores road slipperiness separately for **normal** and **studded tyres**, gives a **jacket recommendation** based on forecast rain, renders the terrain elevation as an **SVG sparkline**, and draws the route and surrounding terrain as a **block-character ASCII map** in the page background.

For longer routes (>5 km or >100 m elevation gain) it samples weather at three points along the route (¹/₆, ½, and ⁵/₆) and uses the worst-scoring point per time horizon, surfacing which segment drove the verdict.

Results are shown across three time horizons (now / +2h / +8h) and cached in `sessionStorage` for 15 minutes so re-checking the same route doesn't hit the APIs again. Failed requests retry with exponential backoff, and surface a typed error UI with a retry button if they still fail. A 30-second cooldown on the check button discourages hammering the public ORS key, and a "last checked X min ago" indicator shows the freshness of the current result.

Address inputs are restricted to Norway — selecting an out-of-bounds result shows an inline field error. The "from" field auto-fills via GPS on first load. Tyre choice (normal/studded) is remembered across sessions.

## How it's scored

Each route gets a score from 0+ based on the rules below. Higher = more slippery. The right-hand column shows how much studded tyres knock off when the rule fires — based on cycling research showing studs help dramatically on ice, helpfully on snow, and barely at all on wet pavement or rough surfaces.

| Condition | Points | Studs |
|---|---|---|
| Overnight low < 0 °C | +30 | -20 |
| Overnight low < -3 °C | +20 | -15 |
| Current temp < 2 °C | +15 | -5 |
| Thaw (now 0–3 °C, was sub-zero) | +10 | -8 |
| Cold precipitation (overnight low < 2 °C) | +20 base | 0 |
| ↳ snow (extra) | +15 | -10 |
| ↳ sleet (extra) | +8 | -4 |
| Cobblestone surface | up to +10 (scaled) | 0 |
| Rough surface (gravel/unpaved/dirt) | up to +5 (scaled) | 0 |
| Ice surface | up to +30 (scaled) | full match |
| Snow surface | up to +15 (scaled) | × 0.7 |
| Active ice/weather alert | +25 | -15 |

Surface penalties scale with the share of the route on that surface — a route 50% cobblestone gets +5, not +10. Studded reductions stack across rules; the studded score is `max(0, total − Σreductions)`.

**Risk levels:** 0–25 clear · 26–55 caution · 56–79 high · 80+ don't ride

## Stack

- Vite 6 + React 19 + TypeScript
- PWA via `vite-plugin-pwa` (installable, offline-capable)
- [OpenRouteService](https://openrouteservice.org/) — geocoding + cycling directions
- [MET Norway Locationforecast 2.0](https://api.met.no/) — weather + MetAlerts

## Setup

```bash
pnpm install
```

Create `.env.local` with your ORS API key:

```
VITE_ORS_KEY=your_key_here
```

Get a free key at [openrouteservice.org](https://openrouteservice.org/dev/#/signup).

```bash
pnpm dev
```

## Deploy

```bash
pnpm build
```

Outputs to `dist/`. Configured for GitHub Pages at `/slippery/`.
