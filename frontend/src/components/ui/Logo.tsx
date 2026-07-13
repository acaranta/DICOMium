/**
 * The DICOMium mark.
 *
 * Served from /public rather than imported, so it is a plain cached HTTP request instead
 * of a ~300 KB base64 blob inlined into the JS bundle.
 */
export default function Logo({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <img
      src="/icon-256.png"
      alt=""
      className={`${className} select-none`}
      // Decorative: the wordmark next to it already carries the name, so a second
      // announcement of "DICOMium" would just be noise to a screen reader.
      aria-hidden="true"
      draggable={false}
      width={256}
      height={256}
    />
  )
}
