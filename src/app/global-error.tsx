// ============================================================================
// GLOBAL ERROR BOUNDARY (ROOT LAYOUT FAILURES)
// ============================================================================

'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global error:', error)
  }, [error])

  return (
    <html>
      <body>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          gap: '16px',
          padding: '24px',
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Something went wrong</h2>
          <p style={{ color: '#666', textAlign: 'center', maxWidth: '400px' }}>
            A critical error occurred. Please refresh the page or contact support.
          </p>
          {error.digest && (
            <p style={{ fontSize: '12px', color: '#999', fontFamily: 'monospace' }}>
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid #ddd',
              background: '#fff',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  )
}
