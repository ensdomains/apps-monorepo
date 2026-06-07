import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { PremiumLabel } from '@/features/register/utils'
import { getByteLength } from '@/utils/domain'
import { PricingDomainHeader } from './PricingDomainHeader'

const meta = {
  title: 'Features/Register/Pricing/PricingDomainHeader',
  component: PricingDomainHeader,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
        <div className="w-full max-w-2xl">
          <Story />
        </div>
      </div>
    ),
  ],
  argTypes: {
    domainName: {
      control: 'text',
      description: 'Domain name to display',
    },
    premiumLabel: {
      control: 'object',
      description: 'Premium label information (optional)',
    },
  },
} satisfies Meta<typeof PricingDomainHeader>

export default meta
type Story = StoryObj<typeof meta>

// Tier 0 (0-30 bytes) - Largest font
export const Tier0SmallASCII: Story = {
  args: {
    domainName: 'abc.eth',
    premiumLabel: undefined,
  },
}

export const Tier0WithEmoji: Story = {
  args: {
    domainName: '😀.eth',
    premiumLabel: undefined,
  },
}

export const Tier0WithChinese: Story = {
  args: {
    domainName: '中国.eth',
    premiumLabel: undefined,
  },
}

// Tier 1 (31-80 bytes) - Medium-large font
export const Tier1MediumLength: Story = {
  args: {
    domainName: 'verylongdomainnamewithmore.eth',
    premiumLabel: undefined,
  },
}

export const Tier1WithMultiByte: Story = {
  args: {
    domainName: '😀😀😀😀😀😀😀.eth',
    premiumLabel: undefined,
  },
}

// Tier 2 (81-150 bytes) - Medium-small font
export const Tier2EmojiHeavy: Story = {
  args: {
    domainName: '😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀.eth',
    premiumLabel: undefined,
  },
}

// Tier 3 (151+ bytes) - Smallest font
export const Tier3EmojiExtreme: Story = {
  args: {
    domainName:
      '😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀.eth',
    premiumLabel: undefined,
  },
}

// Premium label variants
export const WithPremiumLabel3Char: Story = {
  args: {
    domainName: 'abc.eth',
    premiumLabel: {
      label: '3 character premium name',
      variant: 'premium-3',
    } as PremiumLabel,
  },
}

export const WithPremiumLabel4Char: Story = {
  args: {
    domainName: 'abcd.eth',
    premiumLabel: {
      label: '4 character premium name',
      variant: 'premium-4',
    } as PremiumLabel,
  },
}

// Comparison story
export const AllTiersComparison: Story = {
  args: {
    domainName: 'abc.eth',
    premiumLabel: undefined,
  },
  render: () => (
    <div className="space-y-12">
      <div>
        <p className="mb-2 text-gray-600 text-sm">
          Tier 0 (0-30 bytes) - {getByteLength('abc.eth')} bytes - Largest Font
        </p>
        <PricingDomainHeader domainName="abc.eth" premiumLabel={undefined} />
      </div>
      <div>
        <p className="mb-2 text-gray-600 text-sm">
          Tier 1 (31-80 bytes) -{' '}
          {getByteLength('verylongdomainnamewithmore.eth')} bytes
        </p>
        <PricingDomainHeader
          domainName="verylongdomainnamewithmore.eth"
          premiumLabel={undefined}
        />
      </div>
      <div>
        <p className="mb-2 text-gray-600 text-sm">
          Tier 2 (81-150 bytes) -{' '}
          {getByteLength('😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀.eth')} bytes
        </p>
        <PricingDomainHeader
          domainName="😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀.eth"
          premiumLabel={undefined}
        />
      </div>
      <div>
        <p className="mb-2 text-gray-600 text-sm">
          Tier 3 (151+ bytes) -{' '}
          {getByteLength(
            '😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀.eth',
          )}{' '}
          bytes - Smallest Font
        </p>
        <PricingDomainHeader
          domainName="😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀.eth"
          premiumLabel={undefined}
        />
      </div>
    </div>
  ),
}

// Multi-byte character showcase
export const MultiByteShowcase: Story = {
  args: {
    domainName: '🎉🎊🎈.eth',
    premiumLabel: undefined,
  },
  render: () => (
    <div className="space-y-8">
      <div>
        <p className="mb-2 text-gray-600 text-sm">
          Emoji (4 bytes each) - {getByteLength('🎉🎊🎈.eth')} bytes
        </p>
        <PricingDomainHeader domainName="🎉🎊🎈.eth" premiumLabel={undefined} />
      </div>
      <div>
        <p className="mb-2 text-gray-600 text-sm">
          Chinese (3 bytes each) - {getByteLength('中国日本.eth')} bytes
        </p>
        <PricingDomainHeader
          domainName="中国日本.eth"
          premiumLabel={undefined}
        />
      </div>
      <div>
        <p className="mb-2 text-gray-600 text-sm">
          Mixed (ASCII + Emoji + Chinese) - {getByteLength('test😀中国.eth')}{' '}
          bytes
        </p>
        <PricingDomainHeader
          domainName="test😀中国.eth"
          premiumLabel={undefined}
        />
      </div>
    </div>
  ),
}

// Premium with different byte tiers
export const PremiumAcrossTiers: Story = {
  args: {
    domainName: 'abc.eth',
    premiumLabel: {
      label: '3 character premium name',
      variant: 'premium-3',
    } as PremiumLabel,
  },
  render: () => (
    <div className="space-y-8">
      <div>
        <p className="mb-2 text-gray-600 text-sm">
          3-char Premium (Tier 0) - {getByteLength('abc.eth')} bytes
        </p>
        <PricingDomainHeader
          domainName="abc.eth"
          premiumLabel={{
            label: '3 character premium name',
            variant: 'premium-3',
          }}
        />
      </div>
      <div>
        <p className="mb-2 text-gray-600 text-sm">
          Emoji Premium (Tier 0) - {getByteLength('😀.eth')} bytes
        </p>
        <PricingDomainHeader
          domainName="😀.eth"
          premiumLabel={{
            label: '3 character premium name',
            variant: 'premium-3',
          }}
        />
      </div>
    </div>
  ),
}
