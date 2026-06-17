// NOTE: The main Storybook config file (main.ts) does not support TypeScript path aliases (from tsconfig).
// You can use path aliases in preview.tsx and in stories, but not here.

import { defineMain } from '@storybook/tanstack-react/node'
import type { PluginOption } from 'vite'
import { MATERIAL_SYMBOLS_URL } from '../src/components/ui/material-symbol'

const isCloudflarePlugin = (plugin: PluginOption): boolean => {
  if (Array.isArray(plugin)) {
    return plugin.some(isCloudflarePlugin)
  }
  if (typeof plugin !== 'object' || plugin === null || !('name' in plugin)) {
    return false
  }
  const name = plugin.name
  return typeof name === 'string' && name.includes('cloudflare')
}

export default defineMain({
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [],
  framework: '@storybook/tanstack-react',
  previewHead: (head) => `
    ${head}
    <link rel="stylesheet" href="${MATERIAL_SYMBOLS_URL}" />
  `,
  async viteFinal(config) {
    return {
      ...config,
      plugins: config.plugins?.filter((plugin) => !isCloudflarePlugin(plugin)),
    }
  },
})
