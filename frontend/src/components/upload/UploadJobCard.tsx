import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
import { api, type UploadJob } from '../../lib/api'
import { IconCheck, IconChevron, IconSpinner, IconWarn } from '../ui/Icons'

/**
 * Live progress for one ingest job.
 *
 * Polls while the job is running and stops the moment it reaches a terminal state — a finished
 * job is immutable, so continuing to poll would be pure waste.
 *
 * The summary is composed HERE, from the counts, rather than printing the sentence the backend
 * used to send. That sentence was three optional plural clauses joined with "; " and was
 * untranslatable — and the counts were already on this object anyway.
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
  const { t } = useTranslation('upload')
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

  // During extract/scan the total is not yet known, so show an indeterminate bar rather than a
  // progress bar that would jump backwards once the denominator appears.
  const indeterminate = running && job.total_files === 0

  // The outcome, in the user's language, assembled from the counts.
  const summary = [
    job.imported_count > 0 && t('job.result.imported', { count: job.imported_count }),
    job.duplicate_count > 0 && t('job.result.duplicates', { count: job.duplicate_count }),
    job.skipped_count > 0 && t('job.result.skipped', { count: job.skipped_count }),
  ].filter(Boolean) as string[]

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
            {job.source_names[0] ?? t('job.fallbackName')}
            {job.source_names.length > 1 && (
              <span className="text-ink-faint">
                {' '}
                {t('job.andMore', { count: job.source_names.length - 1 })}
              </span>
            )}
          </p>

          <p className="mt-0.5 text-2xs text-ink-dim">
            {running
              ? t(`job.phase.${job.status}`, { defaultValue: job.status })
              : // A failed job carries a reason from the server; a successful one is summarised
                // from its counts.
                failed
                ? job.message
                : summary.join(' · ')}
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
                  {t('job.progress', {
                    processed: job.processed_files,
                    total: job.total_files,
                  })}
                </p>
              )}
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
                {t('job.errors', { count: job.error_count })}
              </button>

              {showErrors && (
                <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto rounded border border-line bg-void p-2">
                  {job.errors.map((e, i) => (
                    <li key={i} className="num text-2xs leading-relaxed text-ink-faint">
                      <span className="text-ink-dim">{e.path}</span>{' '}
                      <span className="text-warn">
                        <Trans
                          i18nKey={`ingest.errorType.${e.error_type}`}
                          ns="errors"
                          defaults={e.error_type}
                        />
                      </span>{' '}
                      — {e.message}
                    </li>
                  ))}
                  {job.error_count > job.errors.length && (
                    <li className="text-2xs italic text-ink-faint">
                      {t('job.andMoreErrors', { count: job.error_count - job.errors.length })}
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
