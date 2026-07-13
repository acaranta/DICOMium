import { useState } from 'react'
import { IconCheck, IconCopy, IconDownload, IconWarn } from '../ui/Icons'

/**
 * The codes, shown exactly once.
 *
 * The server keeps only bcrypt hashes, so once this panel is dismissed they genuinely
 * cannot be recovered — only replaced. The UI therefore refuses to close until the user
 * has explicitly ticked that they saved them. That friction is the whole point: a user who
 * clicks past this screen has, without knowing it, made "lost my phone" mean "lost my
 * account".
 */
export default function RecoveryCodes({
  codes,
  onDone,
}: {
  codes: string[]
  onDone: () => void
}) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [copied, setCopied] = useState(false)

  const asText = codes.join('\n')

  function copy() {
    void navigator.clipboard.writeText(asText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function download() {
    const blob = new Blob(
      [
        'DICOMium recovery codes\n',
        '\n',
        'Each code works once. Keep them somewhere safe and offline —\n',
        'they are the only way back in if you lose your authenticator.\n',
        '\n',
        asText,
        '\n',
      ],
      { type: 'text/plain' },
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'dicomium-recovery-codes.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="rounded border border-warn/40 bg-warn/5 p-4">
      <div className="mb-3 flex items-start gap-2">
        <IconWarn className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        <div>
          <h3 className="text-xs font-medium text-ink">Save your recovery codes</h3>
          <p className="mt-1 text-2xs leading-relaxed text-ink-dim">
            These are shown <strong className="text-warn">once</strong>. Each works a single
            time. If you lose your authenticator and have no code left, you will not be able
            to sign in.
          </p>
        </div>
      </div>

      <ul className="mb-3 grid grid-cols-2 gap-1.5 rounded border border-line bg-void p-3">
        {codes.map((code) => (
          <li key={code} className="num text-xs tracking-wide text-ink">
            {code}
          </li>
        ))}
      </ul>

      <div className="mb-3 flex gap-2">
        <button type="button" className="btn flex-1 justify-center" onClick={copy}>
          {copied ? <IconCheck className="h-3.5 w-3.5 text-ok" /> : <IconCopy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="btn flex-1 justify-center" onClick={download}>
          <IconDownload className="h-3.5 w-3.5" />
          Download
        </button>
      </div>

      <label className="mb-3 flex cursor-pointer items-center gap-2 text-2xs text-ink-dim">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-line bg-void accent-accent"
        />
        I have saved these codes somewhere safe
      </label>

      <button
        type="button"
        className="btn btn-primary w-full justify-center"
        disabled={!acknowledged}
        onClick={onDone}
      >
        Done
      </button>
    </div>
  )
}
