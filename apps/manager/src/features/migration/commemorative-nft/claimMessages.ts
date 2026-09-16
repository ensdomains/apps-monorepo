import { i18n, type MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import {
  type CommemorativeNftClaimError,
  decodeCommemorativeNftClaimError,
} from './contract'

const claimMessages: Record<
  CommemorativeNftClaimError['reason'],
  MessageDescriptor
> = {
  'user-rejected': msg`The mint request was cancelled.`,
  'already-claimed': msg`This commemorative NFT has already been minted.`,
  'invalid-proof': msg`The eligibility proof could not be verified.`,
  reverted: msg`The mint transaction reverted. Please try again.`,
  'wallet-mismatch': msg`Reconnect the eligible owner wallet before minting.`,
  'unsupported-network': msg`The commemorative NFT is not available on this network.`,
  cancelled: msg`The mint transaction was cancelled. You can try minting again.`,
  replaced: msg`The mint transaction was replaced by another transaction. Check your wallet before trying again.`,
  'storage-unavailable': msg`Mint recovery could not be saved in this browser. Allow site storage and try again.`,
  'migration-incomplete': msg`Upgrade all your names before minting your NFT.`,
  'claim-in-progress': msg`A mint is already being prepared in another tab. Continue there or try again after it finishes.`,
  'browser-unsupported': msg`This browser cannot safely coordinate your mint. Try an up-to-date browser.`,
  'feature-disabled': msg`The commemorative NFT is not available right now.`,
  generic: msg`The commemorative NFT could not be minted. Please try again.`,
}

export const getCommemorativeNftClaimMessage = (error: unknown): string =>
  i18n._(claimMessages[decodeCommemorativeNftClaimError(error).reason])

export const getCommemorativeNftEligibilityMessage = (
  reconciling = false,
): string =>
  i18n._(
    reconciling
      ? msg`Your upgrades are still being verified. Check again in a moment.`
      : msg`Eligibility could not be loaded. Please try again.`,
  )

export const getCommemorativeNftUnavailableMessage = (): string =>
  i18n._(msg`The commemorative NFT is not available yet.`)

export const getCommemorativeNftPendingMessage = (): string =>
  i18n._(
    msg`Your mint was submitted. Check its status before trying another mint.`,
  )
