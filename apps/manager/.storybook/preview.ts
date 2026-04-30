import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import type { Preview } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import '../src/styles/index.css'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const createStoryQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  })

const preview: Preview = {
  decorators: [
    (Story) => {
      const queryClient = createStoryQueryClient()
      return React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(I18nProvider, { i18n }, React.createElement(Story)),
      )
    },
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
