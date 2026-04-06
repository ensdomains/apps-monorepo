import type { Meta, StoryObj } from '@storybook/react-vite'
import { USDCIcon } from '@/components/atoms/StableCoinsIcons'
import { getPremiumLabel } from '@/features/register/utils'
import { CryptoPaymentConfirmationContent } from './CryptoPaymentConfirmationContent'

const MAX_255_CHAR_DOMAIN = `${'a'.repeat(251)}.eth`

const meta = {
  title:
    'Features/Register/RegistrationInProgress/CryptoPaymentConfirmationContent',
  component: CryptoPaymentConfirmationContent,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-8">
        <div className="w-full max-w-[520px] rounded-3xl bg-white p-6 shadow-[0_20px_70px_rgba(15,23,42,0.12)]">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    domainName: 'example.eth',
    onConfirm: () => {
      console.log('Buy Name clicked')
    },
    premiumLabel: undefined,
    priceUSD: 352,
    selectedCoinIcon: USDCIcon,
    selectedCoinSymbol: 'USDC',
  },
  argTypes: {
    onConfirm: {
      table: {
        disable: true,
      },
    },
    selectedCoinIcon: {
      table: {
        disable: true,
      },
    },
  },
} satisfies Meta<typeof CryptoPaymentConfirmationContent>

export default meta
type Story = StoryObj<typeof meta>

export const Tier1Short: Story = {}

export const Tier2Medium: Story = {
  args: {
    domainName: 'superlongbrandnewdomainnamethatstillfitsovermultiplelines.eth',
  },
}

export const Tier3Long: Story = {
  args: {
    domainName: 'thisisalonsdfljsdfjsldfkjsldfjsldfkjlskfdjwerwerwerwer.eth',
  },
}

export const Tier3Max255Chars: Story = {
  args: {
    domainName: MAX_255_CHAR_DOMAIN,
  },
}

export const PremiumWrappedDomain: Story = {
  args: {
    domainName: 'abcd.eth',
    premiumLabel: getPremiumLabel('abcd.eth'),
  },
}
