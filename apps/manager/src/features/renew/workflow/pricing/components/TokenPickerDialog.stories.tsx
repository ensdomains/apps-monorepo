import { Trans } from '@lingui/react/macro'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useState } from 'react'
import { match } from 'ts-pattern'
import { TokenPickerContentBase } from '@/features/register-v2/workflow/pricing/components/TokenPickerContent'
import { PaymentDialogBase } from '@/features/shared/payment/components/PaymentDialog'
import type { StablecoinBalance } from '@/lib/smart-account'
import { type RENEWAL_TOKEN, RENEWAL_TOKEN_SYMBOLS } from '@/lib/tokens'
import { RenewalPaymentUpdate } from './RenewalPaymentUpdate'

const WALLET: StablecoinBalance = {
  address: '0x0000000000000000000000000000000000000001',
  symbol: 'USDC',
  decimals: 6,
  balance: '941140000',
  formattedBalance: '941.14',
}
type Phase =
  | 'ready'
  | 'preparing'
  | 'signing'
  | 'updated'
  | 'updated-signing'
  | 'quoting'
/** Production modal contents with local presentation-only transitions. No wallet requests are made. */
const RenewalDialogPreview = ({
  credit,
  initialPhase = 'ready',
  increaseOnClick = false,
}: {
  readonly credit: number
  readonly initialPhase?: Phase
  readonly increaseOnClick?: boolean
}) => {
  const [selectedToken, setSelectedToken] = useState<RENEWAL_TOKEN>()
  const [open, setOpen] = useState(true)
  const [phase, setPhase] = useState(initialPhase)
  const applied = Math.min(credit, 9.69)
  const isUpdated = phase === 'updated' || phase === 'updated-signing'
  const isSigning = phase === 'signing' || phase === 'updated-signing'
  const updatedPrompt = {
    permitValue: 6700000n,
    requiresPermit: true,
    requiredUsdc: 9680000n,
    quotedFeeUsdc: 20000n,
    hcaBalanceUsdc: 3000000n,
  }
  return (
    <PaymentDialogBase
      isDismissible={phase !== 'preparing' && !isSigning}
      onOpenChange={setOpen}
      open={open}
      registrationLayout
      title={isUpdated ? 'Renewal payment updated' : 'Review renewal'}
    >
      {isUpdated ? (
        <RenewalPaymentUpdate
          isSigning={phase === 'updated-signing'}
          label="example"
          onApprove={() => setPhase('updated-signing')}
          onDecline={() => setPhase('ready')}
          prompt={updatedPrompt}
        />
      ) : (
        <TokenPickerContentBase
          acceptedTokens={RENEWAL_TOKEN_SYMBOLS}
          flow="renewal"
          footer={
            <p className="text-ens-quartz-500 text-xs">
              <Trans>
                Includes network fees and a 10% price buffer. Any unused funds
                remain available for future payments.
              </Trans>
            </p>
          }
          funding={{
            registration: 9.68,
            networkFee: 0.01,
            total: 9.69,
            walletDebit: Math.round((9.69 - applied) * 100) / 100,
            hcaCredit: applied,
            isLoading: false,
          }}
          infoMessage={
            applied < 9.69
              ? 'Your wallet may ask you to sign a payment approval, then sign the renewal.'
              : undefined
          }
          isBusy={phase === 'preparing' || isSigning}
          isConnected
          isLoadingBalances={false}
          isQuotingFunding={phase === 'quoting'}
          label="example"
          networkFeeTooltip={
            <Trans>
              An estimate of what the transaction that renews your name will
              cost. It is collected together with the renewal price, in the same
              approval.
            </Trans>
          }
          nextMessage={match({ phase, isSigning })
            .with({ isSigning: true }, () => <Trans>Sign in wallet</Trans>)
            .with({ phase: 'preparing' }, () => (
              <Trans>Preparing renewal...</Trans>
            ))
            .with({ phase: 'quoting' }, () => (
              <Trans>Calculating cost...</Trans>
            ))
            .otherwise(() =>
              applied < 9.69 ? (
                <Trans>Continue in wallet</Trans>
              ) : (
                <Trans>Sign renewal</Trans>
              ),
            )}
          onNext={() => setPhase(increaseOnClick ? 'updated' : 'signing')}
          onSelectCoin={setSelectedToken}
          pricingData={8.8}
          pricingLoading={false}
          selectedToken={selectedToken}
          showNetworkFeeDetails
          stablecoinBalances={[WALLET]}
        />
      )}
    </PaymentDialogBase>
  )
}
const meta = {
  title: 'Features/Renew/Pricing/TokenPickerDialog',
  component: RenewalDialogPreview,
  parameters: { layout: 'fullscreen' },
  args: { credit: 0 },
} satisfies Meta<typeof RenewalDialogPreview>
export default meta
type Story = StoryObj<typeof meta>
export const FullyCovered: Story = { args: { credit: 10 } }
export const PartiallyCovered: Story = { args: { credit: 3 } }
export const NotCovered: Story = { args: { credit: 0 } }
export const Preparing: Story = {
  args: { credit: 3, initialPhase: 'preparing' },
}
export const Signing: Story = { args: { credit: 3, initialPhase: 'signing' } }
export const CalculatingCost: Story = {
  args: { credit: 3, initialPhase: 'quoting' },
}
export const PaymentIncreased: Story = {
  args: { credit: 3, initialPhase: 'updated' },
}
export const UpdatedPaymentSigning: Story = {
  args: { credit: 3, initialPhase: 'updated-signing' },
}
export const IncreasedQuoteOnContinue: Story = {
  args: { credit: 3, increaseOnClick: true },
}
