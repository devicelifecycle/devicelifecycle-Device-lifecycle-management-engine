// ============================================================================
// BYTE-BACK BRAND MARK
// ============================================================================
// Monochrome logo glyph (uses currentColor) — a buyback return-loop arrow
// encircling a "byte"/device square: "Byte" + "Back". Drop-in replacement for
// the lucide Package icon in brand lockups; sized/colored via className exactly
// like a lucide icon. The full-color app badge lives in src/app/icon.svg.

interface ByteBackMarkProps {
  className?: string
}

export function ByteBackMark({ className }: ByteBackMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <rect x="9.6" y="9.6" width="4.8" height="4.8" rx="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}
