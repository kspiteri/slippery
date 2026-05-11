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
  paved: '#2563eb',
  gravel: '#d97706',
  dirt: '#92400e',
  cobblestone: '#7c3aed',
  frozen: '#f85149',
  other: '#374151',
}

export function surfaceColour(name: string): string {
  const bucket = SURFACE_BUCKETS[name.toLowerCase()] ?? 'other'
  return SURFACE_COLOURS[bucket]
}
