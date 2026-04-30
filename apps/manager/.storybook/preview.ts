import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import type { Preview } from '@storybook/react-vite'
import React from 'react'
import '../src/styles/index.css'

i18n.loadAndActivate({ locale: 'en', messages: {} })

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
