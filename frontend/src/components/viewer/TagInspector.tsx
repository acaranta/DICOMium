import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { api, type DicomTag } from '../../lib/api'
import { IconSearch, IconSpinner } from '../ui/Icons'

/** The DICOM header of whichever slice is currently on screen. */
export default function TagInspector({ sopUid }: { sopUid: string | null }) {
  const { t } = useTranslation('viewer')
  const [filter, setFilter] = useState('')

  const { data: tags, isLoading } = useQuery({
    queryKey: ['tags', sopUid],
    queryFn: () => api.get<DicomTag[]>(`/api/instances/${sopUid}/tags`),
    enabled: !!sopUid,
    staleTime: Infinity, // a header never changes
  })

  const shown = useMemo(() => {
    if (!tags) return []
    const q = filter.trim().toLowerCase()
    if (!q) return tags
    return tags.filter(
      (t) =>
        t.keyword.toLowerCase().includes(q) ||
        t.tag.toLowerCase().includes(q) ||
        t.value.toLowerCase().includes(q),
    )
  }, [tags, filter])

  return (
    <div className="flex h-full flex-col">
      <div className="panel-title">
        {t('tags.title')}
        {tags && <span className="num font-normal text-ink-faint">{shown.length}</span>}
      </div>

      <div className="border-b border-line p-2">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-faint" />
          <input
            className="input py-1 pl-7 text-xs"
            placeholder={t('tags.filter')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!sopUid ? (
          <p className="p-3 text-2xs text-ink-faint">{t('tags.noSeries')}</p>
        ) : isLoading ? (
          <div className="flex justify-center p-6 text-ink-faint">
            <IconSpinner className="h-4 w-4" />
          </div>
        ) : !shown.length ? (
          <p className="p-3 text-2xs text-ink-faint">{t('tags.noMatch')}</p>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {/* Renamed from `t` — it shadowed the translation function. DICOM tag keywords
                  and numbers are the standard's own identifiers and are never translated. */}
              {shown.map((tag, i) => (
                <tr key={`${tag.tag}-${i}`} className="border-b border-line/60 align-top">
                  <td className="whitespace-pre px-2 py-1 num text-2xs text-ink-faint">
                    {tag.tag}
                  </td>
                  <td className="px-1 py-1 text-2xs text-ink-dim">{tag.keyword}</td>
                  <td className="break-all px-2 py-1 text-2xs text-ink">{tag.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
