import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import type { Preview } from '@storybook/react-vite'
import React from 'react'
import { MATERIAL_SYMBOLS_URL } from '../src/components/ui/material-symbol'
import '../src/styles/index.css'

i18n.loadAndActivate({ locale: 'en', messages: {} })

/**
 * The app injects the Material Symbols stylesheet via TanStack Router's `head`
 * config in `__root.tsx`. Storybook doesn't run that route tree, so without
 * this the icons render as their text names (e.g. "settings", "drafts"). We
 * inject the same URL once into the preview document head.
 */
if (typeof document !== 'undefined') {
  const ATTR = 'data-storybook-material-symbols'
  if (!document.querySelector(`link[${ATTR}]`)) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = MATERIAL_SYMBOLS_URL
    link.setAttribute(ATTR, 'true')
    document.head.appendChild(link)
  }
}

const preview: Preview = {
  decorators: [
    (Story) =>
      React.createElement(I18nProvider, { i18n }, React.createElement(Story)),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
}

export default preview
