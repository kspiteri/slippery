import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { RouteSegment } from '../api/ors'
import { surfaceColour } from '../logic/surfaces'

interface Props {
  coordinates: [number, number, number][] // [lng, lat, elev]
  segments: RouteSegment[]
}

export function RouteMap({ coordinates, segments }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || coordinates.length === 0) return

    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: false,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
    }).addTo(map)

    L.control.attribution({ prefix: false })
      .addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>')
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
    mapRef.current = map

    // Recalculate layout when container becomes visible (e.g. tab switch from elevation)
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
  }, [coordinates, segments])

  return <div ref={containerRef} className="route-map" />
}
