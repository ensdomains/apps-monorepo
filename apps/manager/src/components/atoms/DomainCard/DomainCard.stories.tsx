import type { Meta, StoryObj } from '@storybook/react-vite'
import { DomainCard } from './DomainCard'

const meta: Meta<typeof DomainCard> = {
  title: 'Atoms/DomainCard',
  component: DomainCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['garnet', 'lapis', 'peridot'],
    },
    domainName: {
      control: 'text',
    },
    className: {
      control: 'text',
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    domainName: 'erni.eth',
    variant: 'garnet',
  },
}

export const Garnet: Story = {
  args: {
    domainName: 'example.eth',
    variant: 'garnet',
  },
}

export const Lapis: Story = {
  args: {
    domainName: 'test.eth',
    variant: 'lapis',
  },
}

export const Peridot: Story = {
  args: {
    domainName: 'domain.eth',
    variant: 'peridot',
  },
}

export const LongDomainName: Story = {
  args: {
    domainName: 'verylongdomainname.eth',
    variant: 'garnet',
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col items-center gap-8">
      <div className="text-center">
        <DomainCard domainName="garnet.eth" variant="garnet" />
        <p className="mt-2 text-sm">Garnet</p>
      </div>
      <div className="text-center">
        <DomainCard domainName="lapis.eth" variant="lapis" />
        <p className="mt-2 text-sm">Lapis</p>
      </div>
      <div className="text-center">
        <DomainCard domainName="peridot.eth" variant="peridot" />
        <p className="mt-2 text-sm">Peridot</p>
      </div>
    </div>
  ),
}
