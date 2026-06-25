'use client'

// Single source of truth for the bulk-upload formatting guide, verbatim
// against the "COE Engine upload tutorial.xlsx" reference. Used on both
// the customer portal's Requests page and the internal/customer-shared
// order-creation CSV Upload tab — duplicating this JSX in both places
// would let the two copies drift out of sync the next time either one
// needs a wording change.

import { useState } from 'react'
import { HelpCircle, ChevronDown } from 'lucide-react'

const REQUIRED_COLUMNS = ['Model', 'Quantity', 'Storage']

export function CsvUploadGuide({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-lg border border-blue-100 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/10">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-400">
          <HelpCircle className="h-4 w-4 shrink-0" />
          Bulk Upload Options
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <div>
            <p className="font-semibold">1. Download one of our two templates and record your assets in this format</p>
            <p className="text-xs text-muted-foreground">This method ensures compliance with the required fields and inputs for best accuracy.</p>
          </div>
          <div>
            <p className="font-semibold">2. Using your own spreadsheet? Need help importing your asset list?</p>
            <ul className="ml-5 list-disc space-y-1 mt-1">
              <li>All your asset information must be in one file.</li>
              <li>The top row of your file must contain a header title for each column of information.</li>
              <li>Required fields — for accurate and quick pricing here are the required fields:</li>
            </ul>
          </div>
          <div className="rounded-md border bg-background px-3 py-2.5 space-y-1.5">
            <p>
              <strong>Cell Phones / Tablets</strong> — <span className="rounded bg-amber-100 px-1 py-0.5 font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Model</span>,{' '}
              <span className="rounded bg-amber-100 px-1 py-0.5 font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Quantity</span>, and{' '}
              <span className="rounded bg-amber-100 px-1 py-0.5 font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Storage</span> are required, additional columns will be uploaded only if recognized.
            </p>
            <p className="text-xs text-muted-foreground">For further reference model should be model only i.e. for Apple products model would be &quot;iPhone 15&quot;, for Samsung products model would be &quot;Galaxy S24&quot;.</p>
            <p className="pt-1">
              <strong>PC / Laptop</strong> — <span className="rounded bg-amber-100 px-1 py-0.5 font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Make</span> &{' '}
              <span className="rounded bg-amber-100 px-1 py-0.5 font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Model</span> are absolutely necessary, Quantity, Processor, RAM & Storage will ensure more accurate quoting.
            </p>
            <p className="text-xs text-muted-foreground">* If Processor, RAM and Storage are not included our system will default to the lowest version for quoting purposes.</p>
            <p className="text-xs text-muted-foreground">* If Quantity is unknown or not entered, a quantity of 1 will be assumed.</p>
          </div>
          <div>
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Example (the system will accept all of this data, but only requires the highlighted columns)</p>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    {['Make', 'Model', 'Quantity', 'Storage', 'Serial Number', 'Color', 'Condition'].map(h => {
                      const required = REQUIRED_COLUMNS.includes(h)
                      return (
                        <th
                          key={h}
                          className={`px-2.5 py-1.5 text-left font-semibold whitespace-nowrap ${
                            required ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : ''
                          }`}
                        >
                          {h}{required && <span className="ml-1 text-[9px] font-bold uppercase tracking-wide">●</span>}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="px-2.5 py-1.5 whitespace-nowrap">Apple</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap font-medium">iPhone 15</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap font-medium">5</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap font-medium">128GB</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap text-muted-foreground">359876543210001</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap text-muted-foreground">Blue</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap text-muted-foreground">excellent</td>
                  </tr>
                  <tr>
                    <td className="px-2.5 py-1.5 whitespace-nowrap">Apple</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap font-medium">iPhone 16</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap font-medium">2</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap font-medium">128GB</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap text-muted-foreground">—</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap text-muted-foreground">Black</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap text-muted-foreground">good</td>
                  </tr>
                  <tr>
                    <td className="px-2.5 py-1.5 whitespace-nowrap">Samsung</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap font-medium">Galaxy S24</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap font-medium">7</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap font-medium">128GB</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap text-muted-foreground">—</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap text-muted-foreground">Black</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap text-muted-foreground">good</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
