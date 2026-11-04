import type {
  HcaFundingApprovalPrompt,
  HcaFundingApprovalState,
} from '@ens-apps/transaction-manager'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useState } from 'react'
import { HcaFundingApprovalDialog } from './HcaFundingApprovalDialog'

const PROMPT: HcaFundingApprovalPrompt = {
  kind: 'approval',
  chainId: 1,
  owner: '0x3333333333333333333333333333333333333333',
  token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  spender: '0x1111111111111111111111111111111111111111',
  amount: 6_420_000n,
  symbol: 'USDC',
  decimals: 6,
  nativeSymbol: 'ETH',
  maxGasCost: 150_000_000_000_000n,
}

const RECEIPT: HcaFundingApprovalState = {
  kind: 'approval-receipt',
  prompt: PROMPT,
  hash: '0x1111111111111111111111111111111111111111111111111111111111111111',
}

/** "Finish" turns the state idle, as the approval landing does. */
const Harness = ({ state }: { readonly state: HcaFundingApprovalState }) => {
  const [current, setCurrent] = useState(state)
  return (
    <>
      <button onClick={() => setCurrent({ kind: 'idle' })} type="button">
        Finish
      </button>
      <button onClick={() => setCurrent(state)} type="button">
        Reopen
      </button>
      <HcaFundingApprovalDialog
        onApprove={() => setCurrent({ kind: 'idle' })}
        onDecline={() => setCurrent({ kind: 'idle' })}
        state={current}
      />
    </>
  )
}

const meta = {
  title: 'Components/HCA funding approval dialog',
  component: Harness,
  args: { state: { kind: 'approval', prompt: PROMPT } },
} satisfies Meta<typeof Harness>

export default meta
type Story = StoryObj<typeof meta>

export const Consent: Story = {}

export const WaitingForWallet: Story = {
  args: { state: { kind: 'approval-wallet', prompt: PROMPT } },
}

/** The approval was sent; the dialog closes once it confirms. */
export const WaitingForReceipt: Story = { args: { state: RECEIPT } }

export const Recovery: Story = {
  args: {
    state: {
      kind: 'approval-recovery',
      prompt: {
        ...PROMPT,
        kind: 'approval-recovery',
        reservedAmount: 6_420_000n,
      },
    },
  },
}

export const Mobile: Story = {
  args: { state: RECEIPT },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}
