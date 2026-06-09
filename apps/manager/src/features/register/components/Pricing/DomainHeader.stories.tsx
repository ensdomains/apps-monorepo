import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { getByteLength } from '@/utils/domain'
import { DomainHeader } from './DomainHeader'
import type { PremiumLabel } from './types'

const meta = {
  title: 'Features/Register/Pricing/DomainHeader',
  component: DomainHeader,
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
    isPremium: {
      control: 'boolean',
      description: 'Whether domain is premium',
    },
    premiumLabel: {
      control: 'object',
      description: 'Premium label information',
    },
  },
} satisfies Meta<typeof DomainHeader>

export default meta
type Story = StoryObj<typeof meta>

// Tier 0 (0-30 bytes) - Largest font: text-5xl sm:text-6xl md:text-7xl
export const Tier0SmallASCII: Story = {
  args: {
    domainName: 'abc.eth',
    isPremium: false,
    premiumLabel: null,
  },
}

export const Tier0WithEmoji: Story = {
  args: {
    domainName: '😀.eth',
    isPremium: false,
    premiumLabel: null,
  },
}

export const Tier0WithChinese: Story = {
  args: {
    domainName: '中国.eth',
    isPremium: false,
    premiumLabel: null,
  },
}

export const Tier0Accented: Story = {
  args: {
    domainName: 'café.eth',
    isPremium: false,
    premiumLabel: null,
  },
}

export const Tier0MediumLength: Story = {
  args: {
    domainName: 'mydomainname.eth',
    isPremium: false,
    premiumLabel: null,
  },
}

// Tier 1 (31-80 bytes) - Medium-large font: text-3xl sm:text-4xl md:text-5xl
export const Tier1MediumLength: Story = {
  args: {
    domainName: 'verylongdomainnamewithmore.eth',
    isPremium: false,
    premiumLabel: null,
  },
}

export const Tier1WithMultiByte: Story = {
  args: {
    domainName: '😀😀😀😀😀😀😀.eth',
    isPremium: false,
    premiumLabel: null,
  },
}

export const Tier1AccentedMixed: Story = {
  args: {
    domainName: 'café café café café café.eth',
    isPremium: false,
    premiumLabel: null,
  },
}

// Tier 2 (81-150 bytes) - Medium-small font: text-xl sm:text-2xl md:text-3xl
export const Tier2LongDomain: Story = {
  args: {
    domainName:
      'verylongdomainnamewithmultiplewordsinreallylongformatwithlots.eth',
    isPremium: false,
    premiumLabel: null,
  },
}

export const Tier2EmojiHeavy: Story = {
  args: {
    domainName: '😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀.eth',
    isPremium: false,
    premiumLabel: null,
  },
}

export const Tier2ChineseMixed: Story = {
  args: {
    domainName: '中国日本韓国印度泰国越南老挝柬埔寨菲律賓馬來.eth',
    isPremium: false,
    premiumLabel: null,
  },
}

// Tier 3 (151+ bytes) - Smallest font: text-base sm:text-lg md:text-xl
export const Tier3VeryLong: Story = {
  args: {
    domainName:
      'verylongdomainnamewithmultiplewordsinreallylongformatwithmultiplelinesthisgoesonevenmorewithmorecontentandmore.eth',
    isPremium: false,
    premiumLabel: null,
  },
}

export const Tier3EmojiExtreme: Story = {
  args: {
    domainName:
      '😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀.eth',
    isPremium: false,
    premiumLabel: null,
  },
}

export const Tier3ChineseHeavy: Story = {
  args: {
    domainName:
      '中国日本韓国印度泰国越南老挝柬埔寨菲律賓馬來西亞新加坡印度尼西亞日本中国日本韓国印度泰国越南老挝柬埔寨.eth',
    isPremium: false,
    premiumLabel: null,
  },
}

// Premium label variants
export const WithPremiumLabel3Char: Story = {
  args: {
    domainName: 'abc.eth',
    isPremium: true,
    premiumLabel: {
      label: '3 character premium name',
      variant: 'premium-3',
    } as PremiumLabel,
  },
}

export const WithPremiumLabel4Char: Story = {
  args: {
    domainName: 'abcd.eth',
    isPremium: true,
    premiumLabel: {
      label: '4 character premium name',
      variant: 'premium-4',
    } as PremiumLabel,
  },
}

// Comparison stories showing all tiers
export const AllTiersComparison: Story = {
  args: {
    domainName: 'abc.eth',
    isPremium: false,
    premiumLabel: null,
  },
  render: () => (
    <div className="space-y-12">
      <div>
        <p className="mb-2 text-gray-600 text-sm">
          Tier 0 (0-30 bytes) - {getByteLength('abc.eth')} bytes - Largest Font
        </p>
        <DomainHeader
          domainName="abc.eth"
          isPremium={false}
          premiumLabel={null}
        />
      </div>
      <div>
        <p className="mb-2 text-gray-600 text-sm">
          Tier 1 (31-80 bytes) -{' '}
          {getByteLength('verylongdomainnamewithmore.eth')} bytes
        </p>
        <DomainHeader
          domainName="verylongdomainnamewithmore.eth"
          isPremium={false}
          premiumLabel={null}
        />
      </div>
      <div>
        <p className="mb-2 text-gray-600 text-sm">
          Tier 2 (81-150 bytes) -{' '}
          {getByteLength('😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀.eth')} bytes
        </p>
        <DomainHeader
          domainName="😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀.eth"
          isPremium={false}
          premiumLabel={null}
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
        <DomainHeader
          domainName="😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀.eth"
          isPremium={false}
          premiumLabel={null}
        />
      </div>
    </div>
  ),
}

// Multi-byte character showcase
export const MultiByteShowcase: Story = {
  args: {
    domainName: '🎉🎊🎈.eth',
    isPremium: false,
    premiumLabel: null,
  },
  render: () => (
    <div className="space-y-8">
      <div>
        <p className="mb-2 text-gray-600 text-sm">
          Emoji (4 bytes each) - {getByteLength('🎉🎊🎈.eth')} bytes
        </p>
        <DomainHeader
          domainName="🎉🎊🎈.eth"
          isPremium={false}
          premiumLabel={null}
        />
      </div>
      <div>
        <p className="mb-2 text-gray-600 text-sm">
          Chinese (3 bytes each) - {getByteLength('中国日本.eth')} bytes
        </p>
        <DomainHeader
          domainName="中国日本.eth"
          isPremium={false}
          premiumLabel={null}
        />
      </div>
      <div>
        <p className="mb-2 text-gray-600 text-sm">
          Arabic - {getByteLength('مرحبا.eth')} bytes
        </p>
        <DomainHeader
          domainName="مرحبا.eth"
          isPremium={false}
          premiumLabel={null}
        />
      </div>
      <div>
        <p className="mb-2 text-gray-600 text-sm">
          Accented Latin (2 bytes each) - {getByteLength('naïve.eth')} bytes
        </p>
        <DomainHeader
          domainName="naïve.eth"
          isPremium={false}
          premiumLabel={null}
        />
      </div>
      <div>
        <p className="mb-2 text-gray-600 text-sm">
          Mixed (ASCII + Emoji + Chinese) - {getByteLength('test😀中国.eth')}{' '}
          bytes
        </p>
        <DomainHeader
          domainName="test😀中国.eth"
          isPremium={false}
          premiumLabel={null}
        />
      </div>
    </div>
  ),
}

// Premium with different tiers
export const PremiumAcrossTiers: Story = {
  args: {
    domainName: 'abc.eth',
    isPremium: true,
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
        <DomainHeader
          domainName="abc.eth"
          isPremium={true}
          premiumLabel={{
            label: '3 character premium name',
            variant: 'premium-3',
          }}
        />
      </div>
      <div>
        <p className="mb-2 text-gray-600 text-sm">
          4-char Premium (Tier 0) - {getByteLength('test.eth')} bytes
        </p>
        <DomainHeader
          domainName="test.eth"
          isPremium={true}
          premiumLabel={{
            label: '4 character premium name',
            variant: 'premium-4',
          }}
        />
      </div>
      <div>
        <p className="mb-2 text-gray-600 text-sm">
          Emoji Premium (Tier 0) - {getByteLength('😀.eth')} bytes
        </p>
        <DomainHeader
          domainName="😀.eth"
          isPremium={true}
          premiumLabel={{
            label: '3 character premium name',
            variant: 'premium-3',
          }}
        />
      </div>
    </div>
  ),
}
