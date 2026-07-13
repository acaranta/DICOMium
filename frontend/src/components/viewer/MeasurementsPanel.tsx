import { useViewerStore } from '../../store/viewerStore'
import { removeAllMeasurements, removeMeasurement } from '../../cornerstone/measurements'
import { IconTrash } from '../ui/Icons'

/**
 * Live measurement readout.
 *
 * For CT the ROI statistics are in Hounsfield units — the modality LUT has already been
 * applied — so an ROI over air reads about -1000 and one over water about 0. That is the
 * quickest way to confirm an exam is calibrated correctly.
 */
export default function MeasurementsPanel() {
  const measurements = useViewerStore((s) => s.measurements)

  return (
    <div className="flex h-full flex-col">
      <div className="panel-title">
        Measurements
        {measurements.length > 0 && (
          <>
            <span className="num font-normal text-ink-faint">{measurements.length}</span>
            <div className="flex-1" />
            <button
              type="button"
              className="text-2xs font-normal normal-case text-ink-faint hover:text-danger"
              onClick={removeAllMeasurements}
            >
              Clear all
            </button>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!measurements.length ? (
          <p className="p-3 text-2xs leading-relaxed text-ink-faint">
            No measurements yet. Pick Length, Angle, an ROI or Probe from the toolbar and
            drag on the image.
          </p>
        ) : (
          <ul>
            {measurements.map((m) => (
              <li
                key={m.uid}
                className="group border-b border-line/60 px-2 py-1.5 hover:bg-raised"
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-2xs font-medium text-ink-dim">{m.label}</span>
                  <button
                    type="button"
                    className="tool-btn h-5 w-5 opacity-0 group-hover:opacity-100 hover:text-danger"
                    title="Delete this measurement"
                    onClick={() => removeMeasurement(m.uid)}
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* A grid, not a joined string: a single line wraps mid-word and the
                    numbers become unreadable. */}
                <dl className="mt-0.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                  {m.stats.map((s) => (
                    <div key={s.key} className="contents">
                      <dt className="text-2xs text-ink-faint">{s.key}</dt>
                      <dd className="num whitespace-nowrap text-xs text-ink">
                        {s.value}
                        {s.unit && <span className="ml-1 text-ink-faint">{s.unit}</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
