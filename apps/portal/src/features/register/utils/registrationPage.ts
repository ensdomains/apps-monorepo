/** The run registered the name and only its ETH address failed, so its Retry must stay reachable. */
export const isRunAtEthAddressRetry = (run: {
  readonly value: unknown
  readonly context: { readonly retryTarget?: string }
}): boolean =>
  run.value === 'error' && run.context.retryTarget === 'settingEthAddress'

/** Whether the page shows the name as taken in place of the registration and its modal. */
export const shouldShowNameTaken = (page: {
  readonly isNameTaken: boolean
  readonly isRegistering: boolean
  readonly isSuccess: boolean
  readonly isEthAddressRetryAhead: boolean
}): boolean =>
  page.isNameTaken &&
  !page.isRegistering &&
  !page.isSuccess &&
  !page.isEthAddressRetryAhead
