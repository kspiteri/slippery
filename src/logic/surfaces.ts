export type SurfaceBucket = 'paved' | 'gravel' | 'dirt' | 'cobblestone' | 'frozen' | 'other'

export const SURFACE_BUCKETS: Record<string, SurfaceBucket> = {
  paved: 'paved', asphalt: 'paved', concrete: 'paved',
  'compacted gravel': 'gravel', 'fine gravel': 'gravel', gravel: 'gravel',
  unpaved: 'dirt', dirt: 'dirt', ground: 'dirt', sand: 'dirt', mud: 'dirt',
  cobblestone: 'cobblestone',
  ice: 'frozen', snow: 'frozen',
  metal: 'other', wood: 'other', salt: 'other', unknown: 'other',
}

export const SURFACE_COLOURS: Record<SurfaceBucket, string> = {
  paved: '#3fb950',
  gravel: '#d4a574',
  dirt: '#8b6f47',
  cobblestone: '#a371f7',
  frozen: '#f85149',
  other: '#6b7a8f',
}

export function surfaceColour(name: string): string {
  const bucket = SURFACE_BUCKETS[name.toLowerCase()] ?? 'other'
  return SURFACE_COLOURS[bucket]
}
