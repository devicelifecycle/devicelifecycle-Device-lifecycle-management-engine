import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow-[0_2px_8px_-2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.15)]',
        secondary: 'border-white/[0.08] bg-white/[0.06] text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
        destructive: 'border-transparent bg-destructive text-destructive-foreground shadow-[0_2px_8px_-2px_rgba(239,68,68,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]',
        outline: 'text-foreground border-white/[0.1]',
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
