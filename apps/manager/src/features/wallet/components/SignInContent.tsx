import { Trans } from '@lingui/react/macro'
import { match } from 'ts-pattern'
import { EnsMobileIcon } from '@/assets/icons/ens-mobile-icon'
import { Button } from '@/components/ui/button'

import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type SignInContentProps = {
  readonly status: {
    readonly isPending: boolean
    readonly isError: boolean
    readonly isPreparing: boolean
    readonly isDisconnecting: boolean
    readonly hasWalletClient: boolean
  }
  readonly actions: {
    readonly signIn: () => void
    readonly skip: () => void
    readonly confirmSkip: () => void
    readonly disconnect: () => void
  }
  readonly isConfirmingSkip: boolean
  readonly titleRef: (element: HTMLElement | null) => void
}

export const SignInContent = ({
  status: { isPending, isError, isPreparing, isDisconnecting, hasWalletClient },
  actions,
  isConfirmingSkip,
  titleRef,
}: SignInContentProps) =>
  isConfirmingSkip ? (
    <>
      <DialogHeader className="items-center gap-0 text-center sm:text-center">
        <DialogTitle
          className="font-medium text-ens-blue-midnight text-xl tracking-tight"
          ref={titleRef}
          tabIndex={-1}
        >
          <Trans>Continue without signing in?</Trans>
        </DialogTitle>
        <DialogDescription className="mt-4 self-stretch text-pretty text-left text-ens-gray text-xs leading-normal">
          <Trans>
            Signing in is the recommended way to use the ENS App. It enables
            notifications for transfers and expirations, and saved items like
            favorites and searches.
          </Trans>
        </DialogDescription>
      </DialogHeader>
      <p className="-mt-3 text-pretty text-ens-gray text-xs leading-normal">
        <Trans>You can sign in anytime from your wallet menu.</Trans>
      </p>

      <DialogFooter className="grid grid-cols-1 *:w-full">
        <Button
          className="min-w-fit flex-1 uppercase tracking-wider"
          onClick={actions.skip}
          size="lg"
          type="button"
          variant="outline"
        >
          <Trans>Continue</Trans>
        </Button>
        <Button
          className="min-w-fit flex-1 bg-ens-blue uppercase tracking-wider hover:bg-ens-blue-hover"
          disabled={
            isPreparing || isPending || isDisconnecting || !hasWalletClient
          }
          onClick={actions.signIn}
          size="lg"
          type="button"
        >
          <Trans>Sign in</Trans>
        </Button>
      </DialogFooter>
    </>
  ) : (
    <>
      <DialogHeader className="items-center gap-0 text-center sm:text-center">
        <div className="mb-5 flex h-12 items-center justify-center text-ens-blue">
          <EnsMobileIcon className="h-12 w-11" />
        </div>
        <DialogTitle
          className="font-medium text-ens-blue-midnight text-xl tracking-tight outline-none"
          ref={titleRef}
          tabIndex={-1}
        >
          <Trans>Authenticate to continue</Trans>
        </DialogTitle>
        <DialogDescription className="mt-2 text-pretty text-ens-gray text-sm leading-normal">
          <Trans>Please sign in with your connected wallet.</Trans>
        </DialogDescription>
      </DialogHeader>

      {isError && (
        <p className="-mt-2 text-center text-destructive text-sm">
          <Trans>Signing didn't go through. Please try again.</Trans>
        </p>
      )}
      {!hasWalletClient && !isDisconnecting && !isPreparing && (
        <p className="-mt-2 text-center text-destructive text-sm">
          <Trans>
            Wallet client missing, please reconnect your wallet and try again.
          </Trans>
        </p>
      )}

      <DialogFooter className="grid grid-cols-1 *:w-full">
        <Button
          className="min-w-fit flex-1 uppercase tracking-wider"
          disabled={isPending || isDisconnecting}
          onClick={actions.disconnect}
          size="lg"
          type="button"
          variant="outline"
        >
          {isDisconnecting ? (
            <Trans>Disconnecting...</Trans>
          ) : (
            <Trans>Disconnect</Trans>
          )}
        </Button>
        <Button
          className="min-w-fit flex-1 bg-ens-blue uppercase tracking-wider hover:bg-ens-blue-hover"
          disabled={
            isPreparing || isPending || isDisconnecting || !hasWalletClient
          }
          onClick={actions.signIn}
          size="lg"
          type="button"
        >
          {match({ isPreparing, isPending, isError })
            .with({ isPreparing: true }, () => (
              <Trans>Preparing your account…</Trans>
            ))
            .with({ isPending: true }, () => <Trans>Signing in...</Trans>)
            .with({ isError: true }, () => <Trans>Try again</Trans>)
            .otherwise(() => (
              <Trans>Sign in</Trans>
            ))}
        </Button>
      </DialogFooter>

      {isError && (
        <Button
          className="-mt-2 h-auto self-center justify-self-center p-0 font-sans text-ens-gray text-xs underline underline-offset-4 hover:text-ens-blue-midnight"
          onClick={actions.confirmSkip}
          type="button"
          variant="link"
        >
          <Trans>Continue without signing in</Trans>
        </Button>
      )}
    </>
  )
