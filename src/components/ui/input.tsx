// ============================================================================
// INPUT COMPONENT
// ============================================================================

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-11 w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_32px_-24px_rgba(0,0,0,0.45)] transition-all duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary/40 focus-visible:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
