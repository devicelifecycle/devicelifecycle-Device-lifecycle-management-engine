// ============================================================================
// AUTH LAYOUT
// ============================================================================

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Login page has its own full-screen split layout, so the auth layout
  // is a simple pass-through. Other auth pages (register, forgot-password,
  // reset-password) manage their own centering via their Card components.
  return <>{children}</>
}