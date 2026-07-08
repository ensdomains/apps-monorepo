/**
 * DQA panel tokens — CSS variable references resolved by the DevDrawer root,
 * which sets the `--dt-*` values per theme (dark default). Mirrors
 * dev-tools/drawerTheme.
 */
export const PANEL = {
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
  error: 'var(--dt-error)',
  success: 'var(--dt-accent-dense)',
  font: '11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSans:
    '12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
} as const
