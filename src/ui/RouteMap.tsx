import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { RouteSegment } from '../api/ors'
import { geocodeReverse } from '../api/ors'
import { surfaceColour, SURFACE_COLOURS } from '../logic/surfaces'
import { Button } from './primitives/Button'
import { SegmentedToggle } from './primitives/SegmentedToggle'

// Set VITE_SURFACE_PREVIEW=true in .env.local to render one segment per surface bucket for colour testing
const DEV_SURFACE_PREVIEW = import.meta.env.VITE_SURFACE_PREVIEW === 'true'

interface Props {
  coordinates: [number, number, number][] // [lng, lat, elev]
  segments: RouteSegment[]
  onMapClick?: (lat: number, lng: number, label: string) => void
}

const TILES = {
  cyclosm: {
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    maxZoom: 20,
    attribution: '<a href="https://www.cyclosm.org">CyclOSM</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    label: 'Cycling',
  },
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    label: 'OSM',
  },
}

type TileKey = keyof typeof TILES

export function RouteMap({ coordinates, segments, onMapClick }: Props) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const attributionRef = useRef<L.Control.Attribution | null>(null)
  const onMapClickRef = useRef(onMapClick)
  const [tileKey, setTileKey] = useState<TileKey>('cyclosm')
  const [clicking, setClicking] = useState(false)
  const [addingWaypoint, setAddingWaypoint] = useState(false)
  const [showDisclaimer, setShowDisclaimer] = useState(false)

  useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])

  // keep addingWaypoint ref so the click handler always sees latest value
  const addingWaypointRef = useRef(addingWaypoint)
  useEffect(() => { addingWaypointRef.current = addingWaypoint }, [addingWaypoint])

  useEffect(() => {
    if (!containerRef.current || coordinates.length === 0) return

    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    const tile = TILES[tileKey]
    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: false,
    })

    tileLayerRef.current = L.tileLayer(tile.url, { maxZoom: tile.maxZoom }).addTo(map)
    attributionRef.current = L.control.attribution({ prefix: false })
      .addAttribution(tile.attribution)
      .addTo(map)

    const toLatLng = (i: number): L.LatLngTuple => [coordinates[i][1], coordinates[i][0]]
    let allLatLngs: L.LatLngTuple[] = []

    const activeSegments: RouteSegment[] = DEV_SURFACE_PREVIEW
      ? (() => {
          const buckets = Object.keys(SURFACE_COLOURS) as (keyof typeof SURFACE_COLOURS)[]
          const n = coordinates.length
          return buckets.map((bucket, i) => ({
            surface: bucket,
            startIdx: Math.floor((i / buckets.length) * n),
            endIdx: Math.floor(((i + 1) / buckets.length) * n) - 1,
          }))
        })()
      : segments

    if (activeSegments && activeSegments.length > 0) {
      for (const seg of activeSegments) {
        const latLngs: L.LatLngTuple[] = []
        for (let i = seg.startIdx; i <= seg.endIdx && i < coordinates.length; i++) {
          latLngs.push(toLatLng(i))
        }
        if (latLngs.length < 2) continue
        L.polyline(latLngs, { color: surfaceColour(seg.surface), weight: 3, opacity: 0.9 }).addTo(map)
        allLatLngs = allLatLngs.concat(latLngs)
      }
    } else {
      allLatLngs = coordinates.map(([lng, lat]) => [lat, lng])
      L.polyline(allLatLngs, { color: surfaceColour('paved'), weight: 3, opacity: 0.9 }).addTo(map)
    }

    if (allLatLngs.length === 0) return

    const startColor = surfaceColour(activeSegments?.[0]?.surface ?? 'unknown')
    const endColor = surfaceColour(activeSegments?.[activeSegments.length - 1]?.surface ?? 'unknown')

    L.circleMarker(allLatLngs[0], {
      radius: 5, color: startColor, fillColor: '#fff', fillOpacity: 1, weight: 2,
    }).addTo(map)

    L.circleMarker(allLatLngs[allLatLngs.length - 1], {
      radius: 5, color: endColor, fillColor: endColor, fillOpacity: 1, weight: 2,
    }).addTo(map)

    map.fitBounds(L.latLngBounds(allLatLngs), { padding: [16, 16] })

    if (onMapClickRef.current) {
      map.on('click', async (e: L.LeafletMouseEvent) => {
        if (!onMapClickRef.current || !addingWaypointRef.current) return
        setClicking(true)
        try {
          const result = await geocodeReverse(e.latlng.lat, e.latlng.lng)
          const label = result?.label ?? `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`
          onMapClickRef.current(e.latlng.lat, e.latlng.lng, label)
          setAddingWaypoint(false)
        } finally {
          setClicking(false)
        }
      })
    }

    mapRef.current = map

    const observer = new ResizeObserver(() => {
      if (containerRef.current && containerRef.current.offsetWidth > 0) {
        map.invalidateSize()
      }
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [coordinates, segments, tileKey])

  return (
    <div className="route-map-wrap">
      <div ref={containerRef} className={`route-map${addingWaypoint ? ' route-map--clickable' : ''}${clicking ? ' route-map--clicking' : ''}`} />
      <div className="map-controls">
        {onMapClick && (
          <Button
            className={addingWaypoint ? 'active' : undefined}
            onClick={() => setAddingWaypoint((v) => !v)}
            title={addingWaypoint ? 'Cancel adding waypoint' : 'Click map to add waypoint'}
          >
            + via
          </Button>
        )}
        <SegmentedToggle<TileKey>
          value={tileKey}
          onChange={setTileKey}
          options={[
            { value: 'cyclosm', label: TILES.cyclosm.label },
            { value: 'osm', label: TILES.osm.label },
          ]}
          ariaLabel="Map tile layer"
        />
        <Button
          className={showDisclaimer ? 'active' : undefined}
          onClick={() => setShowDisclaimer((v) => !v)}
          aria-expanded={showDisclaimer}
          aria-label={t('verdict.mapDisclaimer')}
        >
          <Info size={12} />
        </Button>
      </div>
      {showDisclaimer && (
        <div className="map-disclaimer" role="note">
          {t('verdict.mapDisclaimer')}
        </div>
      )}
    </div>
  )
}
