'use client'

import { Toaster as Sonner } from 'sonner'

function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      expand={false}
      richColors
      closeButton
      className="toaster group"
      toastOptions={{
        duration: 4500,
        classNames: {
          // Base toast shell
          toast:
            'group toast !rounded-xl !border !shadow-xl !backdrop-blur-sm text-sm font-medium transition-all',

          // ── Type-specific shells ───────────────────────────────────────────
          // Success — green
          success:
            '!bg-emerald-50 !border-emerald-200 !text-emerald-900 dark:!bg-emerald-950/80 dark:!border-emerald-700/60 dark:!text-emerald-100',
          // Error — red
          error:
            '!bg-red-50 !border-red-200 !text-red-900 dark:!bg-red-950/80 dark:!border-red-700/60 dark:!text-red-100',
          // Warning — amber
          warning:
            '!bg-amber-50 !border-amber-200 !text-amber-900 dark:!bg-amber-950/80 dark:!border-amber-600/60 dark:!text-amber-100',
          // Info — blue
          info:
            '!bg-blue-50 !border-blue-200 !text-blue-900 dark:!bg-blue-950/80 dark:!border-blue-700/60 dark:!text-blue-100',

          // ── Shared elements ────────────────────────────────────────────────
          title: 'font-semibold text-[13px]',
          description: 'opacity-80 text-[12px] font-normal mt-0.5',
          closeButton:
            '!border !border-current/20 !bg-current/10 hover:!bg-current/20',
          actionButton:
            '!bg-current/15 !text-current hover:!bg-current/25 !rounded-lg !text-xs !font-semibold',
          cancelButton:
            '!bg-black/5 !text-current/70 hover:!bg-black/10 !rounded-lg !text-xs',
          icon: 'shrink-0',
        },
      }}
    />
  )
}

export { Toaster }
