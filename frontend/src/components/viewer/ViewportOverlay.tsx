import type { Series, Study } from '../../lib/api'
import { formatDate, formatPersonName } from '../../lib/dicom'

/**
 * The corner annotations burned over the image.
 *
 * This is the layout every PACS uses, and radiologists read it without looking: who the
 * patient is (top-left), what the acquisition is (top-right), where you are in the stack
 * (bottom-right), and how it is being displayed (bottom-left).
 *
 * Text only — a panel or backdrop here would occlude anatomy.
 */
export default function ViewportOverlay({
  study,
  series,
  index,
  voi,
  zoom,
}: {
  study: Study
  series: Series
  index: { current: number; total: number }
  voi: { width: number; center: number } | null
  zoom: number
}) {
  return (
    <>
      <div className="vp-overlay left-2 top-2">
        <div className="font-medium">{formatPersonName(study.patient_name)}</div>
        <div className="num opacity-70">{study.patient_id}</div>
        <div className="num opacity-70">{formatDate(study.study_date)}</div>
      </div>

      <div className="vp-overlay right-2 top-2 text-right">
        <div className="font-medium">{series.modality}</div>
        <div className="opacity-70">{series.series_description ?? `Series ${series.series_number ?? '—'}`}</div>
        {series.rows && series.columns && (
          <div className="num opacity-70">
            {series.columns}×{series.rows}
          </div>
        )}
      </div>

      <div className="vp-overlay bottom-2 left-2">
        {voi && (
          <div className="num">
            W {Math.round(voi.width)} · L {Math.round(voi.center)}
          </div>
        )}
        <div className="num opacity-70">Zoom {(zoom * 100).toFixed(0)}%</div>
      </div>

      <div className="vp-overlay bottom-2 right-2 text-right">
        <div className="num">
          {index.current} / {index.total}
        </div>
        {series.slice_spacing && (
          <div className="num opacity-70">{series.slice_spacing.toFixed(2)} mm</div>
        )}
      </div>
    </>
  )
}
