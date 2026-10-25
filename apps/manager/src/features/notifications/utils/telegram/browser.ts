import { fromSync } from '@ens-apps/utils/neverthrow'

export type TelegramOpeningStrategy = 'new-tab' | 'safari'

export const getTelegramOpeningStrategy = (
  userAgent: string,
): TelegramOpeningStrategy => {
  // Verified on iOS MetaMask: blank tabs crash and HTTPS links replace Manager.
  // Add other browser exceptions here only after testing their behavior.
  if (/MetaMaskMobile/i.test(userAgent) && /iPhone|iPad|iPod/i.test(userAgent))
    return 'safari'
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
