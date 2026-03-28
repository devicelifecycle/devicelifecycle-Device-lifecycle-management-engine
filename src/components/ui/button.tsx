// ============================================================================
// BUTTON COMPONENT
// ============================================================================

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-2xl text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[0_18px_40px_-24px_rgba(139,67,28,0.75),inset_0_1px_0_rgba(255,248,239,0.22)] hover:bg-primary/90 hover:translate-y-[-1px] hover:shadow-[0_24px_50px_-24px_rgba(139,67,28,0.9),inset_0_1px_0_rgba(255,248,239,0.28)] active:translate-y-0',
        destructive:
          'bg-destructive text-destructive-foreground shadow-[0_18px_40px_-24px_rgba(127,29,29,0.8)] hover:bg-destructive/90 hover:translate-y-[-1px]',
        outline:
          'border border-white/10 bg-white/[0.035] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:bg-white/[0.07] hover:border-primary/35 hover:text-primary-foreground/90 hover:translate-y-[-1px]',
        secondary:
          'bg-secondary text-secondary-foreground shadow-[0_18px_40px_-28px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.28)] hover:bg-secondary/90 hover:translate-y-[-1px]',
        ghost: 'hover:bg-accent/70 hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2.5',
        sm: 'h-8 rounded-xl px-3 text-xs',
        lg: 'h-12 rounded-2xl px-8',
        icon: 'h-10 w-10',
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
