import type { HcaFundingPrompt } from '@ens-apps/transaction-manager'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useState } from 'react'
import { RenewalFundingDialog } from './RenewalFundingDialog'

const ONE_DAI = 10n ** 18n

const USDC_PROMPT: HcaFundingPrompt = {
  permitValue: 6_420_000n,
  requiresPermit: true,
  quotedFeeUsdc: 920_000n,
  hcaBalanceUsdc: 0n,
  requiredUsdc: 5_500_000n,
}

/**
 * Answering clears the prompt, as `useHcaFundingPrompt` does when the wallet
 * opens; the dialog then plays its exit animation.
 */
const Harness = ({ prompt }: { readonly prompt: HcaFundingPrompt }) => {
  const [current, setCurrent] = useState<HcaFundingPrompt | null>(prompt)
  return (
    <>
      <button onClick={() => setCurrent(prompt)} type="button">
        Reopen
      </button>
      <RenewalFundingDialog
        onApprove={() => setCurrent(null)}
        onDecline={() => setCurrent(null)}
        prompt={current}
      />
    </>
  )
}

const meta = {
  title: 'Features/Renew/Renewal funding dialog',
  component: Harness,
  args: { prompt: USDC_PROMPT },
} satisfies Meta<typeof Harness>

export default meta
type Story = StoryObj<typeof meta>

/** Rent and fee in USDC, both pulled from the wallet under one permit. */
export const Usdc: Story = {}

/** Part of the cost is already in the smart account. */
export const PartlyCovered: Story = {
  args: {
    prompt: {
      ...USDC_PROMPT,
      hcaBalanceUsdc: 2_000_000n,
      permitValue: 4_420_000n,
    },
  },
}

/** Rent in DAI, fee in USDC: two amounts, two approvals. */
export const DaiRent: Story = {
  args: {
    prompt: {
      ...USDC_PROMPT,
      permitValue: 920_000n,
      requiredUsdc: 0n,
      token: {
        symbol: 'DAI',
        decimals: 18,
        required: (11n * ONE_DAI) / 2n,
        hcaBalance: 0n,
        permitValue: (11n * ONE_DAI) / 2n,
        requiresPermit: true,
      },
    },
  },
}

/** A standing allowance covers it, so no approval is asked for. */
export const StandingAllowance: Story = {
  args: { prompt: { ...USDC_PROMPT, requiresPermit: false } },
}

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}
