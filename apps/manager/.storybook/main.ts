import { fileURLToPath } from 'node:url'
import { lingui } from '@lingui/vite-plugin'
import type { StorybookConfig } from '@storybook/react-vite'
import type { PluginOption } from 'vite'
import { mergeConfig } from 'vite'
import { linguiMacroPlugin } from '../lingui-macro-plugin'
import { MATERIAL_SYMBOLS_URL } from '../src/components/ui/material-symbol-url'

const isAppOnlyVitePlugin = (plugin: unknown) => {
  if (!plugin || typeof plugin !== 'object' || !('name' in plugin)) {
    return false
  }

  const name = String(plugin.name)
  return name.includes('tanstack') || name.includes('cloudflare')
}

const flattenPlugins = (plugins: readonly unknown[]): unknown[] =>
  plugins.flatMap((plugin) =>
    Array.isArray(plugin) ? flattenPlugins(plugin) : [plugin],
  )

const filterAppOnlyPlugins = (plugins: unknown): PluginOption[] =>
  flattenPlugins(Array.isArray(plugins) ? plugins : []).filter(
    (plugin) => !isAppOnlyVitePlugin(plugin),
  ) as PluginOption[]

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  // The app injects this stylesheet via TanStack Router's `head` config in
  // `__root.tsx`. Storybook doesn't run that route tree, so without this the
  // material-symbol icons render as their text names ("settings", "drafts").
  previewHead: (head) => `
    ${head}
    <link rel="stylesheet" href="${MATERIAL_SYMBOLS_URL}" />
  `,
  viteFinal: (config) => {
    const configWithEnvironments = config as typeof config & {
      environments?: Record<string, { plugins?: unknown }>
    }

    const environments = configWithEnvironments.environments
      ? Object.fromEntries(
          Object.entries(configWithEnvironments.environments).map(
            ([name, environment]) => [
              name,
              {
                ...environment,
                plugins: filterAppOnlyPlugins(environment.plugins),
              },
            ],
          ),
        )
      : undefined

    return mergeConfig(
      {
        ...config,
        plugins: filterAppOnlyPlugins(config.plugins),
        ...(environments ? { environments } : {}),
      },
      {
        plugins: [linguiMacroPlugin(), lingui()],
        resolve: {
          alias: [
            {
              find: /^react$/,
              replacement: fileURLToPath(
                new URL('../node_modules/react/index.js', import.meta.url),
              ),
            },
            {
              find: /^react\/jsx-runtime$/,
              replacement: fileURLToPath(
                new URL(
                  '../node_modules/react/jsx-runtime.js',
                  import.meta.url,
                ),
              ),
            },
            {
              find: /^react-dom$/,
              replacement: fileURLToPath(
                new URL('../node_modules/react-dom/index.js', import.meta.url),
              ),
            },
            {
              find: /^react-dom\/client$/,
              replacement: fileURLToPath(
                new URL('../node_modules/react-dom/client.js', import.meta.url),
              ),
            },
            {
              find: /^@tanstack\/react-start$/,
              replacement: fileURLToPath(
                new URL('./tanstack-start-shim.ts', import.meta.url),
              ),
            },
            {
              find: /^@tanstack\/react-start\/server$/,
              replacement: fileURLToPath(
                new URL('./tanstack-start-server-shim.ts', import.meta.url),
              ),
            },
          ],
          dedupe: ['react', 'react-dom'],
        },
      },
    )
  },
}
export default config
