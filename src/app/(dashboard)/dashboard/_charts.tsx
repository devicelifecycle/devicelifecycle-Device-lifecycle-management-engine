'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

type TickStyle = { fill: string; fontSize: number }
type TooltipStyle = { background: string; border: string; borderRadius: string; color: string }

export function MonthlyOrdersChart({ chartData, gridStroke, tickStyle, tooltipStyle }: {
  chartData: { label: string; orders: number; value: number }[]
  gridStroke: string
  tickStyle: TickStyle
  tooltipStyle: TooltipStyle
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 4, right: 0, left: -10, bottom: 0 }}>
        <CartesianGrid stroke={gridStroke} vertical={false} />
        <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} />
        <YAxis tick={tickStyle} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, 'Orders']} />
        <Bar dataKey="orders" fill="#3b82f6" radius={[8, 8, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function MonthlyValueChart({ chartData, gridStroke, tickStyle, tooltipStyle }: {
  chartData: { label: string; orders: number; value: number }[]
  gridStroke: string
  tickStyle: TickStyle
  tooltipStyle: TooltipStyle
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="valueFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#6ec6b8" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#6ec6b8" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={gridStroke} vertical={false} />
        <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} />
        <YAxis
          tick={tickStyle}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
        />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatCurrency(v), 'Value']} />
        <Area type="monotone" dataKey="value" stroke="#6ec6b8" strokeWidth={2.5} fill="url(#valueFill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function OrderMomentumChart({ trendData, isDark }: {
  trendData: { label: string; orders: number }[]
  isDark: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={trendData}>
        <defs>
          <linearGradient id="momentumFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)'} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: isDark ? '#a8a29e' : '#78716c', fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: isDark ? '#a8a29e' : '#78716c', fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            background: isDark ? 'rgba(18,14,12,0.95)' : '#fff',
            border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
            borderRadius: '18px',
            color: isDark ? '#f5f5f4' : '#1c1917',
          }}
        />
        <Area type="monotone" dataKey="orders" stroke="#3b82f6" strokeWidth={2.5} fill="url(#momentumFill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function PipelineWeightChart({ pipelineData, isDark }: {
  pipelineData: { label: string; count: number; fill: string }[]
  isDark: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={pipelineData}>
        <CartesianGrid stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: isDark ? '#a8a29e' : '#78716c', fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: isDark ? '#a8a29e' : '#78716c', fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            background: isDark ? 'rgba(18,14,12,0.95)' : '#fff',
            border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
            borderRadius: '18px',
            color: isDark ? '#f5f5f4' : '#1c1917',
          }}
        />
        <Bar dataKey="count" radius={[10, 10, 0, 0]}>
          {pipelineData.map((entry) => (
            <Cell key={entry.label} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
