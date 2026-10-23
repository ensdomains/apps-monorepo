import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { Clock } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle, type AlertVariant } from './alert'

const VARIANTS = [
  'default',
  'success',
  'error',
  'warning',
  'info',
] as const satisfies readonly AlertVariant[]

const LONG_HASH =
  '0x1fa9c3e2b7d84f6a90e1c5b3d7f2a8e4c6b0d9f1e3a5c7b9d1f3e5a7c9b1d3f5130d'

const meta = {
  title: 'UI/Alert',
  component: Alert,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-md max-w-full">
        <Story />
      </div>
    ),
  ],
  argTypes: {
    variant: {
      control: 'select',
      options: VARIANTS,
    },
  },
  args: {
    children: (
      <>
        <AlertTitle>Alert title</AlertTitle>
        <AlertDescription>Supporting text for the alert.</AlertDescription>
      </>
    ),
  },
} satisfies Meta<typeof Alert>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { variant: 'default' },
}

export const Success: Story = {
  args: {
    variant: 'success',
    children: (
      <>
        <AlertTitle>Registration Complete!</AlertTitle>
        <AlertDescription>
          Your ENS domain has been successfully registered and is now active.
        </AlertDescription>
      </>
    ),
  },
}

export const ErrorVariant: Story = {
  name: 'Error',
  args: {
    variant: 'error',
    children: (
      <>
        <AlertTitle>Registration Failed</AlertTitle>
        <AlertDescription>
          The registration for mymind.eth could not be completed. You can retry
          or go back to adjust your settings.
        </AlertDescription>
      </>
    ),
  },
}

export const Warning: Story = {
  args: {
    variant: 'warning',
    children: (
      <>
        <AlertTitle>Unfinished registration</AlertTitle>
        <AlertDescription>
          Connect wallet 0x1234...abcd to resume registering mymind.eth.
        </AlertDescription>
      </>
    ),
  },
}

export const InfoVariant: Story = {
  name: 'Info',
  args: {
    variant: 'info',
    children: (
      <>
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>
          Applying changes signs you out of backend authentication.
        </AlertDescription>
      </>
    ),
  },
}

/** Unbroken hex must wrap inside the alert instead of widening it. */
export const LongHash: Story = {
  args: {
    variant: 'error',
    children: (
      <>
        <AlertTitle>Renewal Failed</AlertTitle>
        <AlertDescription>Transaction {LONG_HASH} reverted</AlertDescription>
      </>
    ),
  },
}

export const CustomIcon: Story = {
  args: {
    variant: 'error',
    icon: <Clock className="size-4" />,
    children: <AlertTitle>Another Registration Is Running</AlertTitle>,
  },
}

export const WithoutIcon: Story = {
  args: {
    variant: 'warning',
    icon: null,
    children: (
      <AlertDescription>
        Registered names on Sepolia may be reset periodically.
      </AlertDescription>
    ),
  },
}

/** The line marks the middle of the title line; every icon should sit on it. */
export const Alignment: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {VARIANTS.map((variant) => (
        <div className="relative" key={variant}>
          <Alert variant={variant}>
            <AlertTitle>{variant}</AlertTitle>
            <AlertDescription>Supporting text.</AlertDescription>
          </Alert>
          <div className="pointer-events-none absolute inset-x-0 top-6.75 h-px bg-red-500/60" />
        </div>
      ))}
    </div>
  ),
}
