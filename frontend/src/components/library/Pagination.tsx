import { useTranslation } from 'react-i18next'
import { formatInteger } from '../../lib/format'
import { IconChevron } from '../ui/Icons'

/**
 * Prev / Next, with an honest range.
 *
 * The range label is the point of the whole exercise: the list used to count the rows it had
 * been handed, so a library of three thousand exams described itself as "100 exams". The numbers
 * go through `formatInteger`, so a French user reads `1–50 sur 3 420` rather than `3420` — the
 * grouping is the locale's, not ours.
 */
export default function Pagination({
  offset,
  limit,
  total,
  onChange,
}: {
  offset: number
  limit: number
  total: number
  onChange: (offset: number) => void
}) {
  const { t } = useTranslation('library')

  // One page of results needs no pager. Showing a pair of dead buttons would only be noise.
  if (total <= limit) return null

  const first = offset + 1
  const last = Math.min(offset + limit, total)

  return (
    <div className="mt-4 flex items-center justify-between">
      <p className="text-2xs text-ink-dim">
        <span className="num">
          {t('pagination.range', {
            from: formatInteger(first),
            to: formatInteger(last),
            total: formatInteger(total),
          })}
        </span>
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          className="btn"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          {/* The chevron points down; rotating it is cheaper than a second icon. */}
          <IconChevron className="h-3 w-3 rotate-90" />
          {t('pagination.prev')}
        </button>

        <button
          type="button"
          className="btn"
          disabled={last >= total}
          onClick={() => onChange(offset + limit)}
        >
          {t('pagination.next')}
          <IconChevron className="h-3 w-3 -rotate-90" />
        </button>
      </div>
    </div>
  )
}
