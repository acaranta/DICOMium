import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RenderingEngine } from '@cornerstonejs/core'
import type { Series, Study } from '../../lib/api'
import { fetchVolumeSopUids, loadSeriesImageIds } from '../../cornerstone/imageIds'
import { MPR_VIEWPORTS, setupMpr, type MprHandles } from '../../cornerstone/volume'
import { formatNumber } from '../../lib/format'
import { IconSpinner } from '../ui/Icons'

const PLANE_CLASS: Record<string, string> = {
  'mpr-axial': 'text-mpr-axial',
  'mpr-sagittal': 'text-mpr-sagittal',
  'mpr-coronal': 'text-mpr-coronal',
}

const PLANE_KEY: Record<string, string> = {
  'mpr-axial': 'axial',
  'mpr-sagittal': 'sagittal',
  'mpr-coronal': 'coronal',
}

/**
 * Three orthogonal planes through one volume, linked by crosshairs.
 *
 * Only the series' dominant-orientation instances go into the volume — reformat series often
 * carry a few off-plane reference images, and the volume loader throws on mixed orientations.
 * imageIds.ts does that filtering.
 */
export default function MprView({
  study,
  series,
  engine,
  onError,
}: {
  study: Study
  series: Series
  engine: RenderingEngine
  onError: (message: string) => void
}) {
  const { t } = useTranslation('viewer')
  const refs = useRef<Record<string, HTMLDivElement | null>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let handles: MprHandles | null = null
    setLoading(true)

    void (async () => {
      try {
        const elements: Record<string, HTMLDivElement> = {}
        for (const id of MPR_VIEWPORTS) {
          const el = refs.current[id]
          if (!el) throw new Error('viewport element missing')
          elements[id] = el
        }

        // Only ask which instances are in the volume when the backend says some are not.
        const volumeSopUids =
          series.mpr_instance_count < series.num_instances
            ? await fetchVolumeSopUids(series.series_instance_uid)
            : null

        const { volumeImageIds } = await loadSeriesImageIds(
          study.study_instance_uid,
          series.series_instance_uid,
          volumeSopUids,
        )
        if (cancelled) return

        if (volumeImageIds.length < 3) {
          throw new Error(t('mpr.notEnoughSlices'))
        }

        handles = await setupMpr(engine, series.series_instance_uid, volumeImageIds, elements)
        if (cancelled) {
          handles.destroy()
          return
        }
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setLoading(false)
        // A volume that will not build must surface as a message, never a white screen.
        onError(err instanceof Error ? err.message : t('mpr.failed'))
      }
    })()

    return () => {
      cancelled = true
      handles?.destroy()
      for (const id of MPR_VIEWPORTS) {
        try {
          engine.disableElement(id)
        } catch {
          /* already gone */
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, study.study_instance_uid, series.series_instance_uid])

  const name = series.series_description ?? t('series.fallbackName')
  const excluded = series.num_instances - series.mpr_instance_count

  return (
    <div className="relative grid h-full grid-cols-2 grid-rows-2 gap-px bg-line">
      {MPR_VIEWPORTS.map((id) => (
        <div key={id} className="viewport-cell">
          <div
            ref={(el) => {
              refs.current[id] = el
            }}
            className="cs-element absolute inset-0"
            onContextMenu={(e) => e.preventDefault()}
          />
          <div className={`vp-overlay left-2 top-2 font-medium ${PLANE_CLASS[id]}`}>
            {t(`mpr.planes.${PLANE_KEY[id]}`)}
          </div>
        </div>
      ))}

      {/* The fourth cell explains the controls rather than sitting empty. */}
      <div className="flex flex-col items-start justify-center gap-2 bg-void p-6">
        <h3 className="text-xs font-medium text-ink">{t('mpr.title')}</h3>

        {/* One sentence, one key. This used to be spliced together from six JSX fragments,
            which no translator could reorder. */}
        <p className="text-2xs leading-relaxed text-ink-dim">
          {series.slice_spacing
            ? t('mpr.summary', {
                name,
                count: series.mpr_instance_count,
                spacing: formatNumber(series.slice_spacing, 2),
              })
            : t('mpr.summaryNoSpacing', { name, count: series.mpr_instance_count })}
          {excluded > 0 && (
            <>
              {' '}
              <span className="text-warn">{t('mpr.excluded', { count: excluded })}</span>
            </>
          )}
        </p>

        <ul className="mt-1 space-y-1 text-2xs text-ink-faint">
          <li>{t('mpr.hints.referenceLine')}</li>
          <li>{t('mpr.hints.crosshair')}</li>
          <li>{t('mpr.hints.mouse')}</li>
        </ul>
      </div>

      {loading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-void/80">
          <IconSpinner className="h-6 w-6 text-accent" />
          <p className="text-xs text-ink-dim">
            {t('mpr.building', { count: series.mpr_instance_count })}
          </p>
        </div>
      )}
    </div>
  )
}
