import { useTranslation } from 'react-i18next'
import type { Series, Study } from '../../lib/api'
import { formatPersonName } from '../../lib/dicom'
import { formatDicomDate, formatNumber, formatPercent } from '../../lib/format'

/**
 * The corner annotations burned over the image.
 *
 * This is the layout every PACS uses, and radiologists read it without looking: who the patient
 * is (top-left), what the acquisition is (top-right), where you are in the stack (bottom-right),
 * and how it is being displayed (bottom-left).
 *
 * Numbers are localised; the labels W/L and the units mm are not. `W`/`L` are the universal PACS
 * abbreviations, and `mm` is SI.
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
  const { t } = useTranslation('viewer')

  return (
    <>
      <div className="vp-overlay left-2 top-2">
        <div className="font-medium">
          {formatPersonName(study.patient_name, t('patient.unknown', { ns: 'library' }))}
        </div>
        <div className="num opacity-70">{study.patient_id}</div>
        <div className="num opacity-70">{formatDicomDate(study.study_date)}</div>
      </div>

      <div className="vp-overlay right-2 top-2 text-right">
        {/* A DICOM Defined Term — never translated. */}
        <div className="font-medium">{series.modality}</div>
        <div className="opacity-70">
          {series.series_description ?? t('series.fallbackName')}
        </div>
        {series.rows && series.columns && (
          <div className="num opacity-70">
            {series.columns}×{series.rows}
          </div>
        )}
      </div>

      <div className="vp-overlay bottom-2 left-2">
        {voi && (
          <div className="num">
            W {formatNumber(voi.width, 0)} · L {formatNumber(voi.center, 0)}
          </div>
        )}
        <div className="num opacity-70">
          {t('overlay.zoom')} {formatPercent(zoom * 100)}%
        </div>
      </div>

      <div className="vp-overlay bottom-2 right-2 text-right">
        <div className="num">
          {index.current} / {index.total}
        </div>
        {series.slice_spacing && (
          <div className="num opacity-70">{formatNumber(series.slice_spacing, 2)} mm</div>
        )}
      </div>
    </>
  )
}
