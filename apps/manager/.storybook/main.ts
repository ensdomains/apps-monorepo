// NOTE: The main Storybook config file (main.ts) does not support TypeScript path aliases (from tsconfig).
// You can use path aliases in preview.tsx and in stories, but not here.
import { defineMain } from '@storybook/tanstack-react/node'
import { MATERIAL_SYMBOLS_URL } from '../src/components/ui/material-symbol'

export default defineMain({
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [],
  framework: '@storybook/tanstack-react',
  previewHead: (head) => `
    ${head}
    <link rel="stylesheet" href="${MATERIAL_SYMBOLS_URL}" />
  `,
})
