import { defineMain } from '@storybook/tanstack-react/node'
import { MATERIAL_SYMBOLS_URL } from '@/components/ui/material-symbol'

export default defineMain({
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [],
  framework: '@storybook/tanstack-react',
  previewHead: (head) => `
    ${head}
    <link rel="stylesheet" href="${MATERIAL_SYMBOLS_URL}" />
  `,
})
