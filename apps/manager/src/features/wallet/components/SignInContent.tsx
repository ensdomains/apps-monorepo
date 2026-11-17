import { Trans } from '@lingui/react/macro'
import type { ComponentType, ReactNode, Ref } from 'react'
import { match } from 'ts-pattern'
import { EnsMobileIcon } from '@/assets/icons/ens-mobile-icon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BackendSignIn } from '../hooks/useBackendSignIn'

type SlotProps = {
  readonly className?: string
  readonly children?: ReactNode
}

// Each surface supplies primitives that associate its title and description with its dialog.
export type SignInSlots = {
  readonly Header: ComponentType<SlotProps>
  readonly Title: ComponentType<
    SlotProps & {
      readonly ref?: Ref<HTMLHeadingElement>
      readonly tabIndex?: number
    }
  >
  readonly Description: ComponentType<SlotProps>
  readonly Footer: ComponentType<SlotProps>
}

type SignInContentProps = {
  readonly slots: SignInSlots
  readonly state: BackendSignIn
  /** The smart account is still being set up; signing waits for it. */
  readonly isPreparing: boolean
  /** Lets the connect dialog move focus to the title when this step appears. */
  readonly titleRef?: (element: HTMLElement | null) => void
  readonly footerClassName?: string
}

export const SignInContent = ({
  slots: { Header, Title, Description, Footer },
  state: {
    signIn,
    walletClient,
    isConfirmingSkip,
    setIsConfirmingSkip,
    handleSignIn,
    skipSignIn,
    disconnect,
    isDisconnecting,
  },
  isPreparing,
  titleRef,
  footerClassName,
}: SignInContentProps) =>
  isConfirmingSkip ? (
    <>
      <Header className="items-center gap-0 text-center sm:text-center">
        <Title className="font-medium text-ens-blue-midnight text-xl tracking-tight">
          <Trans>Continue without signing in?</Trans>
        </Title>
        <Description className="mt-4 self-stretch text-pretty text-left text-ens-gray text-xs leading-normal">
          <Trans>
            Signing in is the recommended way to use the ENS App. It enables
            notifications for transfers and expirations, and saved items like
            favorites and searches.
          </Trans>
        </Description>
      </Header>
      <p className="-mt-3 text-pretty text-ens-gray text-xs leading-normal">
        <Trans>You can sign in anytime from your wallet menu.</Trans>
      </p>

      <Footer
        className={cn('flex-row flex-wrap sm:justify-stretch', footerClassName)}
      >
        <Button
          className="min-w-fit flex-1 uppercase tracking-wider"
          onClick={skipSignIn}
          size="lg"
          type="button"
          variant="outline"
        >
          <Trans>Continue</Trans>
        </Button>
        <Button
          className="min-w-fit flex-1 bg-ens-blue uppercase tracking-wider hover:bg-ens-blue-hover"
          disabled={!walletClient}
          onClick={() => {
            setIsConfirmingSkip(false)
            void handleSignIn()
          }}
          size="lg"
          type="button"
        >
          <Trans>Sign in</Trans>
        </Button>
      </Footer>
    </>
  ) : (
    <>
      <Header className="items-center gap-0 text-center sm:text-center">
        <div className="mb-5 flex size-14 items-center justify-center rounded-md bg-ens-blue text-white shadow-ens-blue/30 shadow-lg">
          <EnsMobileIcon className="h-8 w-7" />
        </div>
        <Title
          className="font-medium text-ens-blue-midnight text-xl tracking-tight outline-none"
          ref={titleRef}
          tabIndex={titleRef ? -1 : undefined}
        >
          <Trans>Authenticate to continue</Trans>
        </Title>
        <Description className="mt-2 text-pretty text-ens-gray text-sm leading-normal">
          <Trans>Please sign in with your connected wallet.</Trans>
        </Description>
      </Header>

      {signIn.isError && (
        <p className="-mt-2 text-center text-destructive text-sm">
          <Trans>Signing didn't go through. Please try again.</Trans>
        </p>
      )}
      {!walletClient && !isDisconnecting && !isPreparing && (
        <p className="-mt-2 text-center text-destructive text-sm">
          <Trans>
            Wallet client missing, please reconnect your wallet and try again.
          </Trans>
        </p>
      )}

      <Footer
        className={cn('flex-row flex-wrap sm:justify-stretch', footerClassName)}
      >
        <Button
          className="min-w-fit flex-1 uppercase tracking-wider"
          disabled={signIn.isPending || isDisconnecting}
          onClick={() => void disconnect()}
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
            isPreparing || signIn.isPending || isDisconnecting || !walletClient
          }
          onClick={handleSignIn}
          size="lg"
          type="button"
        >
          {match({ isPreparing, signIn })
            .with({ isPreparing: true }, () => (
              <Trans>Preparing your account…</Trans>
            ))
            .with({ signIn: { isPending: true } }, () => (
              <Trans>Signing in...</Trans>
            ))
            .with({ signIn: { isError: true } }, () => <Trans>Try again</Trans>)
            .otherwise(() => (
              <Trans>Sign in</Trans>
            ))}
        </Button>
      </Footer>

      {signIn.isError && (
        <Button
          className="-mt-2 h-auto self-center justify-self-center p-0 font-sans text-ens-gray text-xs underline underline-offset-4 hover:text-ens-blue-midnight"
          onClick={() => setIsConfirmingSkip(true)}
          type="button"
          variant="link"
        >
          <Trans>Continue without signing in</Trans>
        </Button>
      )}
    </>
  )
