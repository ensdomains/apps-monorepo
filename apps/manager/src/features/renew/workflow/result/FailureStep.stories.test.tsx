import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { composeStories } from '@storybook/tanstack-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import * as stories from './FailureStep.stories'

const { Default } = composeStories(stories)

it('renders the renewal failure story with its required provider context', () => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider i18n={i18n}>
        <Default />
      </I18nProvider>
    </QueryClientProvider>,
  )
  expect(screen.getByRole('button', { name: 'Try Again' })).toBeVisible()
  view.unmount()
  queryClient.clear()
})
