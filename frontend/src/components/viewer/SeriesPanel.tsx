import { useTranslation } from 'react-i18next'
import type { Series } from '../../lib/api'
import { modalityColor } from '../../lib/dicom'
import { IconCube } from '../ui/Icons'

/**
 * The series rail.
 *
 * Thumbnails are draggable onto any viewport cell, and double-click loads into the
 * active one. Non-viewable series (structured reports, dose records) are shown but
 * dimmed and inert — hiding them entirely would make images look "missing".
 */
export default function SeriesPanel({
  series,
  activeSeriesUid,
  onSelect,
}: {
  series: Series[]
  activeSeriesUid: string | null
  onSelect: (uid: string) => void
}) {
  const { t } = useTranslation('viewer')

  return (
    <aside className="flex w-rail shrink-0 flex-col border-r border-line bg-panel">
      <div className="panel-title">{t('series.title')}</div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5">
        {series.map((s) => {
          const selected = s.series_instance_uid === activeSeriesUid
          const usable = s.is_viewable

          return (
            <button
              key={s.series_instance_uid}
              type="button"
              draggable={usable}
              disabled={!usable}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-series-uid', s.series_instance_uid)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => usable && onSelect(s.series_instance_uid)}
              title={
                usable
                  ? t('series.dragHint', {
                      name: s.series_description ?? t('series.fallbackName'),
                    })
                  : t('series.notViewable')
              }
              className={`group w-full rounded border text-left transition-colors ${
                selected
                  ? 'border-accent bg-accent/5'
                  : 'border-line bg-raised hover:border-line-bright'
              } ${usable ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-40'}`}
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-t bg-void">
                {s.has_thumbnail ? (
                  <img
                    src={`/api/series/${s.series_instance_uid}/thumbnail`}
                    alt=""
                    className="h-full w-full object-contain"
                    draggable={false}
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <span className={`num text-base font-medium ${modalityColor(s.modality)}`}>
                      {s.modality}
                    </span>
                  </div>
                )}

                {/* A volume-capable series is what MPR needs; mark it so the user knows
                    which one to pick without trial and error. */}
                {s.is_reconstructable && (
                  <span
                    className="absolute right-1 top-1 rounded bg-black/70 p-0.5 text-accent"
                    title={t('series.mprCapable')}
                  >
                    <IconCube className="h-3 w-3" />
                  </span>
                )}

                <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 num text-2xs text-ink-dim">
                  {s.num_instances}
                </span>
              </div>

              <div className="px-1.5 py-1">
                <div className="flex items-baseline gap-1">
                  <span className={`num text-2xs font-medium ${modalityColor(s.modality)}`}>
                    {s.series_number ?? '—'}
                  </span>
                  <span className="truncate text-2xs text-ink" title={s.series_description ?? ''}>
                    {s.series_description ?? t('series.fallbackName')}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
