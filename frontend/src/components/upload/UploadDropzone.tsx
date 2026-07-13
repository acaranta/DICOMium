import { useCallback, useRef, useState, type DragEvent } from 'react'
import { api, type UploadJob } from '../../lib/api'
import { formatBytes } from '../../lib/dicom'
import { IconUpload, IconSpinner } from '../ui/Icons'

/**
 * Accepts a zip/tar of an exam, or loose DICOM files, or a whole dropped folder.
 *
 * Folder drops are the important case: a burned DVD's files have no extension (A0001,
 * B0001...), so we cannot filter by type and must send everything and let the server
 * decide what is DICOM. It skips the bundled viewers and PDFs itself.
 */
export default function UploadDropzone({ onQueued }: { onQueued: (job: UploadJob) => void }) {
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(0)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const send = useCallback(
    async (files: File[]) => {
      if (!files.length) return
      setError('')
      setBusy(true)
      setSent(0)
      try {
        const job = await api.upload<UploadJob>('/api/uploads', files, setSent)
        onQueued(job)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setBusy(false)
        setSent(0)
      }
    },
    [onQueued],
  )

  /** Walk a dropped directory tree. The DataTransferItem API is the only way to get at
   *  the contents of a dropped folder. */
  const filesFromDrop = useCallback(async (dt: DataTransfer): Promise<File[]> => {
    const entries = Array.from(dt.items)
      .map((item) => item.webkitGetAsEntry?.())
      .filter(Boolean) as FileSystemEntry[]

    if (!entries.length) return Array.from(dt.files)

    const out: File[] = []
    const walk = async (entry: FileSystemEntry): Promise<void> => {
      if (entry.isFile) {
        const file = await new Promise<File>((resolve, reject) =>
          (entry as FileSystemFileEntry).file(resolve, reject),
        )
        out.push(file)
        return
      }
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      // readEntries returns at most 100 at a time; keep reading until it is empty.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject),
        )
        if (!batch.length) break
        for (const child of batch) await walk(child)
      }
    }

    await Promise.all(entries.map(walk))
    return out
  }, [])

  async function onDrop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    if (busy) return
    await send(await filesFromDrop(e.dataTransfer))
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        onClick={() => !busy && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed px-6 py-8 transition-colors ${
          over
            ? 'border-accent bg-accent/5'
            : 'border-line-bright bg-panel hover:border-ink-faint hover:bg-raised'
        } ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        {busy ? (
          <>
            <IconSpinner className="h-5 w-5 text-accent" />
            <p className="text-xs text-ink-dim">
              Uploading… <span className="num">{Math.round(sent * 100)}%</span>
            </p>
            <div className="h-0.5 w-48 overflow-hidden rounded-full bg-line">
              <div
                className="h-full bg-accent transition-[width] duration-150"
                style={{ width: `${sent * 100}%` }}
              />
            </div>
          </>
        ) : (
          <>
            <IconUpload className="h-5 w-5 text-ink-faint" />
            <p className="text-xs text-ink">
              Drop an exam here, or <span className="text-accent">browse</span>
            </p>
            <p className="max-w-md text-center text-2xs leading-relaxed text-ink-faint">
              A ZIP or TAR of a burned CD/DVD, a folder, or loose DICOM files. Files need
              no extension — the server reads their headers. Bundled viewers and PDFs are
              ignored automatically.
            </p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          void send(files)
        }}
      />

      {error && (
        <p className="mt-2 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export { formatBytes }
