// ============================================================================
// BUTTON COMPONENT
// ============================================================================

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[0_4px_14px_-3px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-primary/90 hover:shadow-[0_6px_20px_-4px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.2)] hover:translate-y-[-1px] active:translate-y-[1px] active:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.1)]',
        destructive:
          'bg-destructive text-destructive-foreground shadow-[0_4px_14px_-3px_rgba(239,68,68,0.3),inset_0_1px_0_rgba(255,255,255,0.1)] hover:bg-destructive/90 hover:translate-y-[-1px]',
        outline:
          'border border-white/[0.08] bg-white/[0.03] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)] hover:bg-white/[0.06] hover:border-white/[0.12] hover:translate-y-[-1px] hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] hover:bg-secondary/80 hover:translate-y-[-1px]',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-11 rounded-xl px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
