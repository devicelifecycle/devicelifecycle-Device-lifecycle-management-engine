'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { formatCurrency } from '@/lib/utils'

function fmtDay(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

type DailyPoint = { date: string; count: number; revenue: number }

export function OrderVolumeChart({ daily, tickEvery }: { daily: DailyPoint[]; tickEvery: number }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tickFormatter={(v, i) => i % tickEvery === 0 ? fmtDay(v) : ''}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false} tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false} tickLine={false}
        />
        <Tooltip
          labelFormatter={v => fmtDay(String(v))}
          formatter={(v: number) => [v, 'Orders']}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))' }}
        />
        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function RevenueTrendChart({ daily, tickEvery }: { daily: DailyPoint[]; tickEvery: number }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={daily} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tickFormatter={(v, i) => i % tickEvery === 0 ? fmtDay(v) : ''}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false} tickLine={false}
        />
        <YAxis
          tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false} tickLine={false}
        />
        <Tooltip
          labelFormatter={v => fmtDay(String(v))}
          formatter={(v: number) => [formatCurrency(v), 'Revenue']}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))' }}
        />
        <Bar dataKey="revenue" fill="#10b981" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
