import { useTranslation } from 'react-i18next'
import { elevationGain, SAMPLE_FRACTIONS } from '../../logic/weatherSampling'
import { distanceM } from '../../logic/geo'

interface Props {
  coordinates: [number, number, number][] // [lng, lat, elev]
  showSampleMarkers: boolean
  color?: string
}

const WIDTH = 600
const HEIGHT = 64
const PAD_X = 4
const PAD_Y = 6
const RESAMPLE_POINTS = 80
const HIDE_BELOW_GAIN_M = 20

export function ElevationProfile({ coordinates, showSampleMarkers, color }: Props) {
  const { t } = useTranslation()
  if (coordinates.length < 2) return null
  const gain = Math.round(elevationGain(coordinates))
  if (gain < HIDE_BELOW_GAIN_M) return null

  const cumulative: number[] = [0]
  for (let i = 1; i < coordinates.length; i++) {
    cumulative.push(cumulative[i - 1] + distanceM(coordinates[i - 1], coordinates[i]))
  }
  const total = cumulative[cumulative.length - 1]
  if (total <= 0) return null

  // Walk a single cursor — both targets and cumulative are monotonic, so O(n+m) instead of O(n·m)
  const samples: { d: number; elev: number }[] = []
  let cursor = 0
  for (let i = 0; i < RESAMPLE_POINTS; i++) {
    const target = (i / (RESAMPLE_POINTS - 1)) * total
    while (cursor < cumulative.length - 1 && cumulative[cursor + 1] <= target) cursor++
    samples.push({ d: target, elev: coordinates[cursor][2] ?? 0 })
  }

  const minElev = Math.min(...samples.map((s) => s.elev))
  const maxElev = Math.max(...samples.map((s) => s.elev))
  const elevRange = Math.max(maxElev - minElev, 1)

  const xOf = (d: number) => PAD_X + (d / total) * (WIDTH - PAD_X * 2)
  const yOf = (elev: number) =>
    HEIGHT - PAD_Y - ((elev - minElev) / elevRange) * (HEIGHT - PAD_Y * 2)

  const linePath = samples
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xOf(s.d).toFixed(2)} ${yOf(s.elev).toFixed(2)}`)
    .join(' ')
  const fillPath =
    `${linePath} L ${xOf(total).toFixed(2)} ${HEIGHT - PAD_Y} L ${xOf(0).toFixed(2)} ${HEIGHT - PAD_Y} Z`

  const markers: { x: number; y: number }[] = []
  if (showSampleMarkers) {
    let mCursor = 0
    for (const fraction of SAMPLE_FRACTIONS) {
      const target = fraction * total
      while (mCursor < cumulative.length - 1 && cumulative[mCursor] < target) mCursor++
      markers.push({ x: xOf(target), y: yOf(coordinates[mCursor][2] ?? 0) })
    }
  }

  return (
    <div className="elevation-profile" aria-label={t('elevation.aria', { gain })}
      style={color ? { '--accent': color } as React.CSSProperties : undefined}
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="elevation-svg"
        role="img"
      >
        <path d={fillPath} className="elevation-fill" />
        <path d={linePath} className="elevation-line" />
        {markers.map((m, i) => (
          <circle key={i} cx={m.x} cy={m.y} r={3} className="elevation-marker" />
        ))}
      </svg>
      <div className="elevation-meta">
        <span>↑ {gain} m</span>
        <span>{Math.round(minElev)}–{Math.round(maxElev)} m</span>
      </div>
    </div>
  )
}
