import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { api, type Study, type UploadJob } from '../lib/api'
import { formatAge, formatDate, formatPersonName, modalityColor } from '../lib/dicom'
import AppShell from '../components/layout/AppShell'
import UploadDropzone from '../components/upload/UploadDropzone'
import UploadJobCard from '../components/upload/UploadJobCard'
import { IconSearch, IconSpinner, IconTrash } from '../components/ui/Icons'

export default function LibraryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [jobIds, setJobIds] = useState<string[]>([])

  const { data: studies, isLoading } = useQuery({
    queryKey: ['studies', search],
    queryFn: () =>
      api.get<Study[]>(`/api/studies${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  })

  const remove = useMutation({
    mutationFn: (uid: string) => api.delete(`/api/studies/${uid}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['studies'] }),
  })

  return (
    <AppShell>
      <div className="mx-auto h-full max-w-6xl overflow-y-auto px-6 py-6">
        <div className="mb-6 flex items-baseline justify-between">
          <div>
            <h1 className="text-base font-medium text-ink">Studies</h1>
            <p className="mt-0.5 text-xs text-ink-dim">
              {studies ? `${studies.length} exam${studies.length === 1 ? '' : 's'}` : ' '}
            </p>
          </div>

          <div className="relative w-64">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <input
              className="input pl-8"
              placeholder="Patient, ID, description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="mb-6">
          <UploadDropzone
            onQueued={(job: UploadJob) => setJobIds((ids) => [job.id, ...ids])}
          />
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
              {search ? 'No studies match that search.' : 'No studies yet — upload an exam above.'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded border border-line">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-panel">
                  {['Patient', 'Study', 'Date', 'Modality', 'Series', 'Images', ''].map((h, i) => (
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
                        {formatPersonName(s.patient_name)}
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
                      {formatDate(s.study_date)}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
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
                        title="Delete this study"
                        className="tool-btn opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (
                            confirm(
                              `Delete this study and all ${s.num_instances} of its images from disk?\n\nThis cannot be undone.`,
                            )
                          ) {
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
      </div>
    </AppShell>
  )
}
