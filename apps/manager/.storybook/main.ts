import type { StorybookConfig } from '@storybook/tanstack-react'
import { MATERIAL_SYMBOLS_URL } from '../src/components/ui/material-symbol.tsx'

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [],
  framework: {
    name: '@storybook/tanstack-react',
    options: {},
  },
  previewHead: (head) => `
    ${head}
    <link rel="stylesheet" href="${MATERIAL_SYMBOLS_URL}" />
  `,
}
export default config
