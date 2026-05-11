import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { RouteSegment } from '../api/ors'
import { geocodeReverse } from '../api/ors'
import { surfaceColour } from '../logic/surfaces'

interface Props {
  coordinates: [number, number, number][] // [lng, lat, elev]
  segments: RouteSegment[]
  onMapClick?: (lat: number, lng: number, label: string) => void
}

const TILES = {
  cyclosm: {
    url: 'https://tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
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
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const attributionRef = useRef<L.Control.Attribution | null>(null)
  const onMapClickRef = useRef(onMapClick)
  const [tileKey, setTileKey] = useState<TileKey>('cyclosm')
  const [clicking, setClicking] = useState(false)
  const [addingWaypoint, setAddingWaypoint] = useState(false)

  useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])

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

    if (segments && segments.length > 0) {
      for (const seg of segments) {
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

    const startColor = surfaceColour(segments?.[0]?.surface ?? 'unknown')
    const endColor = surfaceColour(segments?.[segments.length - 1]?.surface ?? 'unknown')

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

  // keep addingWaypoint ref so the click handler always sees latest value
  const addingWaypointRef = useRef(addingWaypoint)
  useEffect(() => { addingWaypointRef.current = addingWaypoint }, [addingWaypoint])

  const nextKey: TileKey = tileKey === 'cyclosm' ? 'osm' : 'cyclosm'

  return (
    <div className="route-map-wrap">
      <div ref={containerRef} className={`route-map${addingWaypoint ? ' route-map--clickable' : ''}${clicking ? ' route-map--clicking' : ''}`} />
      <div className="map-controls">
        {onMapClick && (
          <button
            type="button"
            className={`map-layer-btn${addingWaypoint ? ' active' : ''}`}
            onClick={() => setAddingWaypoint((v) => !v)}
            title={addingWaypoint ? 'Cancel adding waypoint' : 'Click map to add waypoint'}
          >
            + via
          </button>
        )}
        <button
          type="button"
          className="map-layer-btn"
          onClick={() => setTileKey(nextKey)}
          title={`Switch to ${TILES[nextKey].label} map`}
        >
          {TILES[tileKey].label}
        </button>
      </div>
    </div>
  )
}
