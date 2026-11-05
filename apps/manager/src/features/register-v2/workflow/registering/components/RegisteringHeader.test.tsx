import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  RegisteringHeader,
  type RegisteringHeaderProps,
} from './RegisteringHeader'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const renderHeader = (uiStage: RegisteringHeaderProps['uiStage']) =>
  render(
    <I18nProvider i18n={i18n}>
      <RegisteringHeader
        fillProgress={40}
        isRegistrationComplete={false}
        stageLabel="Setting primary name"
        uiStage={uiStage}
      />
    </I18nProvider>,
  ).container

describe('RegisteringHeader', () => {
  it('asks to keep the browser open while the name is registered', () => {
    const header = renderHeader({
      notifications: 'settings',
      transaction: 'pendingRegistration',
    })

    expect(header).toHaveTextContent(
      'Keep this browser open while your name is registered',
    )
  })

  it('names the setup step once the name is registered', () => {
    const header = renderHeader({
      notifications: 'settings',
      transaction: 'settingPrimaryNameReverse',
    })

    expect(header).toHaveTextContent('Setting primary name')
  })
})
