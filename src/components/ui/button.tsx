// ============================================================================
// BUTTON COMPONENT
// ============================================================================

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-2xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // ── Primary action — brand orange ──────────────────────────────────
        default:
          'bg-primary text-primary-foreground shadow-[0_14px_32px_-16px_rgba(139,67,28,0.65),inset_0_1px_0_rgba(255,248,239,0.22)] hover:bg-primary/90 hover:translate-y-[-1px] hover:shadow-[0_20px_40px_-16px_rgba(139,67,28,0.8),inset_0_1px_0_rgba(255,248,239,0.28)] active:translate-y-0 active:shadow-none',

        // ── Success / confirm / submit / create — emerald green ────────────
        // Use for: "Create Order", "Submit Request", "Accept Quote", "Confirm"
        success:
          'bg-emerald-600 text-white shadow-[0_14px_32px_-16px_rgba(5,150,105,0.55),inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-emerald-500 hover:translate-y-[-1px] hover:shadow-[0_20px_40px_-16px_rgba(5,150,105,0.7),inset_0_1px_0_rgba(255,255,255,0.22)] active:translate-y-0 active:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500',

        // ── Destructive / delete / reject — red ───────────────────────────
        // Use for: "Delete", "Reject", "Remove", "Cancel Order"
        destructive:
          'bg-red-600 text-white shadow-[0_14px_32px_-16px_rgba(185,28,28,0.55),inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-red-500 hover:translate-y-[-1px] hover:shadow-[0_20px_40px_-16px_rgba(185,28,28,0.7)] active:translate-y-0 active:bg-red-700',

        // ── Warning — amber ────────────────────────────────────────────────
        // Use for: "Reprice", "Override", "Flag"
        warning:
          'bg-amber-500 text-white shadow-[0_14px_32px_-16px_rgba(180,83,9,0.50),inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-amber-400 hover:translate-y-[-1px] hover:shadow-[0_20px_40px_-16px_rgba(180,83,9,0.65)] active:translate-y-0 active:bg-amber-600',

        // ── Outline — secondary action ─────────────────────────────────────
        outline:
          'border border-border/60 bg-background/60 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-muted/70 hover:border-primary/30 hover:translate-y-[-1px] active:translate-y-0',

        // ── Secondary — muted fill ─────────────────────────────────────────
        secondary:
          'bg-secondary text-secondary-foreground shadow-[0_14px_32px_-20px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.22)] hover:bg-secondary/80 hover:translate-y-[-1px] active:translate-y-0',

        // ── Ghost — no background ──────────────────────────────────────────
        ghost: 'hover:bg-accent/60 hover:text-accent-foreground active:bg-accent/80',

        // ── Link ──────────────────────────────────────────────────────────
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2.5',
        sm: 'h-8 rounded-xl px-3 text-xs',
        lg: 'h-12 rounded-2xl px-8 text-base',
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
