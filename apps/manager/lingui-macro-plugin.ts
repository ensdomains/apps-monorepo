import type { Plugin } from 'vite'

/**
 * Runs Lingui's macro transform for Vite builds that do not pass source through
 * Babel otherwise (for example TanStack Start SSR and Storybook's Vite builder).
 */
export const linguiMacroPlugin = (): Plugin => ({
  name: 'lingui:babel-macro',
  enforce: 'pre',
  async transform(code, id) {
    // Under `noUncheckedIndexedAccess`, `id.split('?')[0]` is typed
    // `string | undefined`. `String.prototype.split` always returns at
    // least one element, so falling back to `id` is purely a type-narrowing
    // safety net and never triggers at runtime.
    const file = id.split('?')[0] ?? id

    if (file.includes('/node_modules/')) return null
    if (!/\.[cm]?[jt]sx?$/.test(file)) return null
    if (!/@lingui\/(react|core)\/macro/.test(code)) return null

    const { transformAsync } = await import('@babel/core')
    const result = await transformAsync(code, {
      filename: id,
      babelrc: false,
      configFile: false,
      sourceMaps: true,
      plugins: ['@lingui/babel-plugin-lingui-macro'],
      parserOpts: {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'],
      },
    })

    if (!result?.code) return null

    return {
      code: result.code,
      map: result.map ?? null,
    }
  },
})
