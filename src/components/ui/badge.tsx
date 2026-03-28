import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/90 text-primary-foreground shadow-[0_14px_28px_-18px_rgba(182,93,47,0.9),inset_0_1px_0_rgba(255,255,255,0.18)]',
        secondary: 'border-white/[0.08] bg-white/[0.06] text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
        destructive: 'border-transparent bg-destructive/90 text-destructive-foreground shadow-[0_14px_28px_-18px_rgba(239,68,68,0.55),inset_0_1px_0_rgba(255,255,255,0.1)]',
        outline: 'text-foreground border-white/[0.1] bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
