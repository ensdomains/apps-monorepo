import { fromSync } from '@ens-apps/utils/neverthrow'

export type TelegramOpeningStrategy = 'new-tab' | 'safari' | 'copy-link'

export const getTelegramOpeningStrategy = (
  userAgent: string,
): TelegramOpeningStrategy => {
  // MetaMask mobile can replace Manager instead of opening a tab. Safari
  // handoff works on iOS; Android intent handoffs failed in device testing.
  // Add other browser exceptions here only after testing their behavior.
  if (/MetaMaskMobile/i.test(userAgent)) {
    if (/iPhone|iPad|iPod/i.test(userAgent)) return 'safari'
    if (/Android/i.test(userAgent)) return 'copy-link'
  }
  return 'new-tab'
}

export const getTelegramContinueUrl = (
  authorizationUrl: string,
  strategy: TelegramOpeningStrategy,
): string =>
  strategy === 'safari'
    ? authorizationUrl.replace(/^https:\/\//, 'x-safari-https://')
    : authorizationUrl

export const tryOpenTelegramTab = (
  authorizationUrl: string,
  strategy: TelegramOpeningStrategy,
): void => {
  // Activation can expire during initiation. This is a hint, not a guarantee:
  // keep the explicit link even after opening (noopener also returns null).
  if (strategy !== 'new-tab' || !navigator.userActivation?.isActive) return
  fromSync(
    () => window.open(authorizationUrl, '_blank', 'noopener,noreferrer'),
    () => undefined,
  ).unwrapOr(undefined)
}
