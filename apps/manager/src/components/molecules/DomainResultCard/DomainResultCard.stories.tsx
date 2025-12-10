import type { Meta, StoryObj } from '@storybook/react-vite'
import { DomainResultCard } from './DomainResultCard'

const meta = {
  title: 'Molecules/DomainResultCard',
  component: DomainResultCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    status: {
      control: 'select',
      options: ['available', 'premium'],
    },
    price: {
      control: 'number',
    },
  },
} satisfies Meta<typeof DomainResultCard>

export default meta
type Story = StoryObj<typeof meta>

export const Available: Story = {
  args: {
    domainName: 'example.eth',
    status: 'available',
    price: 45.2,
  },
}

export const Premium: Story = {
  args: {
    domainName: 'premium.eth',
    status: 'premium',
    price: 245000,
  },
}

export const MultipleCards = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <DomainResultCard
        domainName="awesome.eth"
        status="available"
        price={32.5}
      />
      <DomainResultCard
        domainName="super.eth"
        status="premium"
        price={125000}
      />
      <DomainResultCard
        domainName="test123.eth"
        status="available"
        price={12.75}
      />
    </div>
  ),
}

export const DifferentLengths = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <DomainResultCard domainName="a.eth" status="premium" price={2450000} />
      <DomainResultCard domainName="ab.eth" status="premium" price={1225000} />
      <DomainResultCard domainName="abc.eth" status="premium" price={245000} />
      <DomainResultCard
        domainName="abcd.eth"
        status="available"
        price={61.25}
      />
      <DomainResultCard
        domainName="verylongdomainname.eth"
        status="available"
        price={12.25}
      />
    </div>
  ),
}

export const PricingVariations = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <DomainResultCard
        domainName="cheap.eth"
        status="available"
        price={2.45}
      />
      <DomainResultCard
        domainName="moderate.eth"
        status="available"
        price={122.5}
      />
      <DomainResultCard
        domainName="expensive.eth"
        status="premium"
        price={24500}
      />
    </div>
  ),
}

export const WithoutPricing = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <DomainResultCard domainName="noprice.eth" status="available" />
      <DomainResultCard domainName="alsono.eth" status="premium" />
    </div>
  ),
}

export const CustomLabels = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <DomainResultCard domainName="custom.eth" status="available" price={50} />
      <DomainResultCard
        domainName="another.eth"
        status="premium"
        price={1000}
        priceLabel="one-time"
      />
    </div>
  ),
}

export const InteractiveExample = {
  render: () => (
    <div className="max-w-xl">
      <h3 className="mb-4 font-semibold text-lg">Domain Search Results</h3>
      <div className="space-y-3">
        <DomainResultCard
          domainName="myproject.eth"
          status="available"
          price={42.5}
        />
      </div>
    </div>
  ),
}
