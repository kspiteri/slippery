import { useTranslation } from 'react-i18next'
import { Bookmark, X } from 'lucide-react'
import type { SavedRoute } from '../state'
import { MAX_SAVED_ROUTES } from '../state'

const ROUTE_STALE_MS = 30 * 24 * 60 * 60 * 1000

interface Props {
  routes: SavedRoute[]
  onLoad: (route: SavedRoute) => void
  onDelete: (index: number) => void
}

export function SavedRoutesList({ routes, onLoad, onDelete }: Props) {
  const { t } = useTranslation()
  if (routes.length === 0) return null
  return (
    <div className="saved-routes card">
      <div className="saved-routes-header">
        <span className="saved-routes-label">{t('savedRoutes.label')}</span>
        <span className="saved-routes-count">{routes.length}/{MAX_SAVED_ROUTES}</span>
      </div>
      <ul className="saved-routes-list">
        {routes.map((r, i) => {
          const stale = Date.now() - r.routeCachedAt > ROUTE_STALE_MS
          return (
            <li key={`${r.name}-${r.routeCachedAt}`} className="saved-route-item">
              <button
                type="button"
                className="saved-route-load"
                onClick={() => onLoad(r)}
              >
                <Bookmark size={12} />
                <span className="saved-route-name">{r.name}</span>
                {stale && <span className="saved-route-stale">{t('savedRoutes.stale')}</span>}
              </button>
              <button
                type="button"
                className="saved-route-delete"
                aria-label={t('savedRoutes.delete')}
                onClick={() => onDelete(i)}
              >
                <X size={12} />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
