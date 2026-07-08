import type { CSSProperties } from 'react'

/**
 * DevDrawer tokens as CSS variables so the whole drawer themes at runtime.
 * The variable values are set on the drawer root (and trigger) from
 * `DRAWER_THEME_VARS[theme]` — dark is the default theme.
 */
export const DRAWER = {
  bg: 'var(--dt-bg)',
  surface: 'var(--dt-surface)',
  fg: 'var(--dt-fg)',
  muted: 'var(--dt-muted)',
  border: 'var(--dt-border)',
  borderStrong: 'var(--dt-border-strong)',
  accent: 'var(--dt-accent)',
  accentHover: 'var(--dt-accent-hover)',
  accentBg: 'var(--dt-accent-bg)',
  accentDense: 'var(--dt-accent-dense)',
  onAccent: 'var(--dt-on-accent)',
  handleBg: 'var(--dt-handle-bg)',
  handleFg: 'var(--dt-handle-fg)',
  error: 'var(--dt-error)',
  font: '11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSans:
    '12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
} as const

export const DRAWER_THEME_VARS: Record<'light' | 'dark', CSSProperties> = {
  light: {
    '--dt-bg': '#faf9f7',
    '--dt-surface': '#ffffff',
    '--dt-fg': '#191919',
    '--dt-muted': '#737373',
    '--dt-border': '#d9d9d9',
    '--dt-border-strong': '#cee1e8',
    '--dt-accent': '#0080bc',
    '--dt-accent-hover': '#0070a4',
    '--dt-accent-bg': '#e5f7ff',
    '--dt-accent-dense': '#093c52',
    '--dt-on-accent': '#ffffff',
    '--dt-handle-bg': '#093c52',
    '--dt-handle-fg': '#ffffff',
    '--dt-error': '#b42013',
  } as CSSProperties,
  dark: {
    '--dt-bg': '#111827',
    '--dt-surface': '#1f2937',
    '--dt-fg': '#e5e7eb',
    '--dt-muted': '#9ca3af',
    '--dt-border': '#374151',
    '--dt-border-strong': '#374151',
    '--dt-accent': '#38bdf8',
    '--dt-accent-hover': '#0ea5e9',
    '--dt-accent-bg': '#0c4a6e',
    '--dt-accent-dense': '#7dd3fc',
    '--dt-on-accent': '#0b1220',
    '--dt-handle-bg': '#0b1220',
    '--dt-handle-fg': '#e5e7eb',
    '--dt-error': '#f87171',
  } as CSSProperties,
}
