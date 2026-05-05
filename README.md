# slippery

Bergen bike route slipperiness checker — a PWA that tells you whether it's safe to cycle your commute today.

## What it does

Enter a from/to address and it fetches:
- **Cycling route** via OpenRouteService (with surface type and elevation)
- **Weather** via MET Norway (overnight low, current temp, precipitation, active alerts)

It scores road slipperiness separately for **normal** and **studded tyres**, gives a **jacket recommendation** based on forecast rain, and renders the terrain elevation as **ASCII art** in the background.

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
