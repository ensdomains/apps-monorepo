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
    link: '/register?name=example.eth',
  },
}

export const Premium: Story = {
  args: {
    domainName: 'premium.eth',
    status: 'premium',
    price: 245000,
    link: '/register?name=premium.eth',
  },
}

export const MultipleCards = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <DomainResultCard
        domainName="awesome.eth"
        status="available"
        price={32.5}
        link="/register?name=awesome.eth"
      />
      <DomainResultCard
        domainName="super.eth"
        status="premium"
        price={125000}
        link="/register?name=super.eth"
      />
      <DomainResultCard
        domainName="test123.eth"
        status="available"
        price={12.75}
        link="/register?name=test123.eth"
      />
    </div>
  ),
}

export const DifferentLengths = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <DomainResultCard
        domainName="a.eth"
        status="premium"
        price={2450000}
        link="/register?name=a.eth"
      />
      <DomainResultCard
        domainName="ab.eth"
        status="premium"
        price={1225000}
        link="/register?name=ab.eth"
      />
      <DomainResultCard
        domainName="abc.eth"
        status="premium"
        price={245000}
        link="/register?name=abc.eth"
      />
      <DomainResultCard
        domainName="abcd.eth"
        status="available"
        price={61.25}
        link="/register?name=abcd.eth"
      />
      <DomainResultCard
        domainName="verylongdomainname.eth"
        status="available"
        price={12.25}
        link="/register?name=verylongdomainname.eth"
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
        link="/register?name=cheap.eth"
      />
      <DomainResultCard
        domainName="moderate.eth"
        status="available"
        price={122.5}
        link="/register?name=moderate.eth"
      />
      <DomainResultCard
        domainName="expensive.eth"
        status="premium"
        price={24500}
        link="/register?name=expensive.eth"
      />
    </div>
  ),
}

export const WithoutPricing = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <DomainResultCard
        domainName="noprice.eth"
        status="available"
        link="/register?name=noprice.eth"
      />
      <DomainResultCard
        domainName="alsono.eth"
        status="premium"
        link="/register?name=alsono.eth"
      />
    </div>
  ),
}

export const CustomLabels = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <DomainResultCard
        domainName="custom.eth"
        status="available"
        price={50}
        link="/register?name=custom.eth"
      />
      <DomainResultCard
        domainName="another.eth"
        status="premium"
        price={1000}
        priceLabel="one-time"
        link="/register?name=another.eth"
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
          link="/register?name=myproject.eth"
        />
      </div>
    </div>
  ),
}
