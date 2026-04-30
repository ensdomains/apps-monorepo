import type { StorybookConfig } from '@storybook/react-vite'
import { MATERIAL_SYMBOLS_URL } from '../src/components/ui/material-symbol-url'

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
}
export default config
