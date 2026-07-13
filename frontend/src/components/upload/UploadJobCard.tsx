import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type UploadJob } from '../../lib/api'
import { IconCheck, IconChevron, IconSpinner, IconWarn } from '../ui/Icons'

const PHASE_LABEL: Record<string, string> = {
  pending: 'Queued',
  receiving: 'Receiving',
  extracting: 'Extracting archive',
  scanning: 'Finding DICOM files',
  importing: 'Importing',
  finalizing: 'Building thumbnails',
}

/**
 * Live progress for one ingest job.
 *
 * Polls while the job is running and stops the moment it reaches a terminal state — a
 * finished job is immutable, so continuing to poll would be pure waste.
 */
export default function UploadJobCard({
  jobId,
  initial,
  onDone,
}: {
  jobId: string
  initial?: UploadJob
  onDone?: () => void
}) {
  const [showErrors, setShowErrors] = useState(false)
  const [notified, setNotified] = useState(false)

  const { data: job } = useQuery({
    queryKey: ['upload', jobId],
    queryFn: () => api.get<UploadJob>(`/api/uploads/${jobId}`),
    initialData: initial,
    refetchInterval: (query) => (query.state.data?.is_terminal ? false : 750),
  })

  if (!job) return null

  if (job.is_terminal && !notified) {
    setNotified(true)
    onDone?.()
  }

  const failed = job.status === 'failed'
  const withErrors = job.status === 'completed_with_errors'
  const done = job.status === 'completed'
  const running = !job.is_terminal

  // During extract/scan the total is not yet known, so show an indeterminate bar rather
  // than a progress bar that would jump backwards once the denominator appears.
  const indeterminate = running && job.total_files === 0

  return (
    <div
      className={`rounded border bg-panel p-3 ${
        failed ? 'border-danger/40' : withErrors ? 'border-warn/40' : 'border-line'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5">
          {running && <IconSpinner className="h-4 w-4 text-accent" />}
          {done && <IconCheck className="h-4 w-4 text-ok" />}
          {(failed || withErrors) && (
            <IconWarn className={`h-4 w-4 ${failed ? 'text-danger' : 'text-warn'}`} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-ink">
            {job.source_names[0] ?? 'Upload'}
            {job.source_names.length > 1 && (
              <span className="text-ink-faint"> +{job.source_names.length - 1} more</span>
            )}
          </p>

          <p className="mt-0.5 text-2xs text-ink-dim">
            {running ? PHASE_LABEL[job.status] ?? job.status : job.message}
          </p>

          {running && (
            <div className="mt-2">
              <div className="h-0.5 w-full overflow-hidden rounded-full bg-line">
                {indeterminate ? (
                  <div className="h-full w-1/3 animate-pulse bg-accent" />
                ) : (
                  <div
                    className="h-full bg-accent transition-[width] duration-300"
                    style={{ width: `${job.progress * 100}%` }}
                  />
                )}
              </div>
              {job.total_files > 0 && (
                <p className="mt-1 num text-2xs text-ink-faint">
                  {job.processed_files} / {job.total_files} files
                </p>
              )}
            </div>
          )}

          {job.is_terminal && !failed && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 num text-2xs text-ink-faint">
              {job.imported_count > 0 && (
                <span className="text-ok">+{job.imported_count} imported</span>
              )}
              {job.duplicate_count > 0 && <span>{job.duplicate_count} already present</span>}
              {job.skipped_count > 0 && <span>{job.skipped_count} non-DICOM ignored</span>}
            </div>
          )}

          {job.error_count > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowErrors((v) => !v)}
                className="flex items-center gap-1 text-2xs text-warn hover:underline"
              >
                <IconChevron
                  className={`h-3 w-3 transition-transform ${showErrors ? 'rotate-0' : '-rotate-90'}`}
                />
                {job.error_count} file{job.error_count === 1 ? '' : 's'} could not be imported
              </button>

              {showErrors && (
                <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto rounded border border-line bg-void p-2">
                  {job.errors.map((e, i) => (
                    <li key={i} className="num text-2xs leading-relaxed text-ink-faint">
                      <span className="text-ink-dim">{e.path}</span>{' '}
                      <span className="text-warn">{e.error_type}</span> — {e.message}
                    </li>
                  ))}
                  {job.error_count > job.errors.length && (
                    <li className="text-2xs italic text-ink-faint">
                      …and {job.error_count - job.errors.length} more
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
