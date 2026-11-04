export const title = 'Registration payment confirmation snapshot'

const viewMatchesClick = (state) =>
  state.displayedMethod === state.confirmedMethod &&
  state.displayedFigures === state.confirmedFigures

const startMatchesClick = (state) =>
  state.startedMethod === state.confirmedMethod &&
  state.startedFigures === state.confirmedFigures

export const state = (value) => {
  switch (value.phase) {
    case 'choosing':
      return 'Choosing a payment method'
    case 'clicked':
      return viewMatchesClick(value)
        ? 'Payment clicked; confirmed view retained'
        : 'Payment clicked; live data replaced the confirmed view'
    case 'busy':
      return viewMatchesClick(value)
        ? 'Payment in flight; confirmed view retained'
        : 'Payment in flight; live data replaced the confirmed view'
    case 'started':
      if (value.actorRevision !== value.clickedActorRevision)
        return 'Registration started after the selected method changed'
      return startMatchesClick(value)
        ? 'Registration started from the confirmation snapshot'
        : 'Registration started from different method or figures'
    case 'aborted':
      return 'Changed actor selection aborted the stale click'
    case 'settled':
      return 'Payment attempt settled'
    default:
      return String(value.phase)
  }
}

export const step = (action) => {
  if (action.startsWith('UserSelect')) return 'you select a payment method'
  if (action.startsWith('FallbackSelect'))
    return 'the fallback effect selects a payment method'
  if (action.startsWith('Select')) return 'the selected payment method changes'

  switch (action) {
    case 'ClickPayment':
      return 'you press the payment button'
    case 'RefreshFigures':
      return 'a balance or quote refreshes'
    case 'ObserveBusy':
      return 'React commits the in-flight state'
    case 'DispatchRegistrationStart':
      return 'the app starts registration or rejects a stale click'
    case 'Finish':
      return 'the attempt finishes'
    case 'Done':
      return null
    default:
      return action
  }
}

export const group = (value) => {
  if (value.phase === 'choosing') return 'choosing'
  if (value.phase === 'settled') return 'settled'
  if (value.phase === 'aborted') return 'aborted'
  if (value.phase === 'started')
    return startMatchesClick(value) ? 'protected' : 'changed'
  return viewMatchesClick(value) ? 'protected' : 'changed'
}

export const colors = {
  choosing: 'blue',
  protected: 'teal',
  changed: 'orange',
  aborted: 'yellow',
  settled: 'purple',
}
