import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { api, type StudyPage, type UploadJob } from '../lib/api'
import { formatAge, formatPersonName, modalityColor } from '../lib/dicom'
import { formatDicomDate, formatInteger } from '../lib/format'
import { useDebounced } from '../lib/useDebounced'
import AppShell from '../components/layout/AppShell'
import Pagination from '../components/library/Pagination'
import UploadDropzone from '../components/upload/UploadDropzone'
import UploadJobCard from '../components/upload/UploadJobCard'
import { IconSearch, IconSpinner, IconTrash } from '../components/ui/Icons'

const PAGE_SIZE = 50

export default function LibraryPage() {
  const { t } = useTranslation('library')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [jobIds, setJobIds] = useState<string[]>([])

  const term = useDebounced(search)

  // Searching from page 7 must land on page 1 of the results, not on an empty page 7 of them.
  useEffect(() => setOffset(0), [term])

  const { data: page, isLoading } = useQuery({
    queryKey: ['studies', term, offset],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
      if (term) params.set('q', term)
      return api.get<StudyPage>(`/api/studies?${params}`)
    },
    // Hold the current page on screen while the next one loads, rather than blanking the table
    // and bouncing the scroll position on every click of Next.
    placeholderData: keepPreviousData,
  })

  const studies = page?.items
  const total = page?.total ?? 0

  // Deleting the last row of the last page leaves us pointing past the end. The server answers
  // honestly with an empty page and the real total, so step back rather than show a blank table.
  useEffect(() => {
    if (page && offset > 0 && page.items.length === 0) {
      setOffset(Math.max(0, offset - PAGE_SIZE))
    }
  }, [page, offset])

  const remove = useMutation({
    mutationFn: (uid: string) => api.delete(`/api/studies/${uid}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['studies'] }),
  })

  return (
    <AppShell>
      <div className="mx-auto h-full max-w-6xl overflow-y-auto px-6 py-6">
        <div className="mb-6 flex items-baseline justify-between">
          <div>
            <h1 className="text-base font-medium text-ink">{t('title')}</h1>
            {/* The total from the server, not `studies.length` — that only ever knew about the
                rows on this page, which is how a library of 3 000 exams reported "100".
                `count` picks the plural; `formatted` is what gets shown, so the number reads the
                same here as it does in the pager below. */}
            <p className="mt-0.5 text-xs text-ink-dim">
              {page ? t('count', { count: total, formatted: formatInteger(total) }) : ' '}
            </p>
          </div>

          <div className="relative w-64">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <input
              className="input pl-8"
              placeholder={t('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="mb-6">
          <UploadDropzone onQueued={(job: UploadJob) => setJobIds((ids) => [job.id, ...ids])} />
        </div>

        {jobIds.length > 0 && (
          <div className="mb-6 space-y-2">
            {jobIds.map((id) => (
              <UploadJobCard
                key={id}
                jobId={id}
                onDone={() => queryClient.invalidateQueries({ queryKey: ['studies'] })}
              />
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16 text-ink-faint">
            <IconSpinner className="h-5 w-5" />
          </div>
        ) : !studies?.length ? (
          <div className="rounded border border-line bg-panel py-16 text-center">
            <p className="text-xs text-ink-dim">
              {term ? t('emptySearch') : t('empty')}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded border border-line">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-panel">
                  {[
                    t('columns.patient'),
                    t('columns.study'),
                    t('columns.date'),
                    t('columns.modality'),
                    t('columns.series'),
                    t('columns.images'),
                    '',
                  ].map((h, i) => (
                    <th
                      key={h || i}
                      className="px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-ink-dim"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {studies.map((s) => (
                  <tr
                    key={s.study_instance_uid}
                    onClick={() => navigate(`/viewer/${s.study_instance_uid}`)}
                    className="group cursor-pointer border-b border-line bg-base transition-colors last:border-0 hover:bg-panel"
                  >
                    <td className="px-3 py-2.5">
                      <div className="text-xs font-medium text-ink">
                        {formatPersonName(s.patient_name, t('patient.unknown'))}
                      </div>
                      <div className="num text-2xs text-ink-faint">
                        {s.patient_id}
                        {s.patient_sex && ` · ${s.patient_sex}`}
                        {formatAge(s.patient_birth_date, s.study_date) &&
                          ` · ${formatAge(s.patient_birth_date, s.study_date)}`}
                      </div>
                    </td>

                    <td className="max-w-xs px-3 py-2.5">
                      <div className="truncate text-xs text-ink">
                        {s.study_description || <span className="text-ink-faint">—</span>}
                      </div>
                      {s.accession_number && (
                        <div className="num text-2xs text-ink-faint">{s.accession_number}</div>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5 num text-xs text-ink-dim">
                      {formatDicomDate(s.study_date)}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        {/* Modality codes are DICOM Defined Terms, not English words — never
                            translated. */}
                        {s.modalities.map((m) => (
                          <span
                            key={m}
                            className={`rounded border border-line bg-raised px-1.5 py-0.5 num text-2xs font-medium ${modalityColor(m)}`}
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="px-3 py-2.5 num text-xs text-ink-dim">{s.num_series}</td>
                    <td className="px-3 py-2.5 num text-xs text-ink-dim">{s.num_instances}</td>

                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        title={t('delete')}
                        className="tool-btn opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(t('deleteConfirm', { count: s.num_instances }))) {
                            remove.mutate(s.study_instance_uid)
                          }
                        }}
                      >
                        <IconTrash />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {studies?.length ? (
          <Pagination
            offset={offset}
            limit={PAGE_SIZE}
            total={total}
            onChange={setOffset}
          />
        ) : null}
      </div>
    </AppShell>
  )
}
