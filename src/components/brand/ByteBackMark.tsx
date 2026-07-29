// ============================================================================
// BYTE-BACK BRAND MARK
// ============================================================================
// Monochrome logo glyph (uses currentColor) — the "BB" wordmark with a pixel/
// byte dissolve, matching the official blue Byte-Back logo. Drop-in replacement
// for the lucide Package icon in brand lockups; sized/colored via className
// exactly like a lucide icon. The full-color app badge lives in src/app/icon.svg.

interface ByteBackMarkProps {
  className?: string
}

export function ByteBackMark({ className }: ByteBackMarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      {/* pixel / byte dissolve */}
      <rect x="1.4" y="8" width="2.3" height="2.3" rx="0.4" />
      <rect x="1.4" y="12.9" width="2.3" height="2.3" rx="0.4" />
      <rect x="4.7" y="10.45" width="2.3" height="2.3" rx="0.4" />
      {/* "BB" */}
      <text x="14.5" y="12.4" textAnchor="middle" dominantBaseline="central"
            fontFamily="Arial, Helvetica, sans-serif" fontWeight={900} fontSize="15" letterSpacing="-1.4">BB</text>
    </svg>
  )
}
