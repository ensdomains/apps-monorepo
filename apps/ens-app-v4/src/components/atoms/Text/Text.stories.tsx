import type { Meta, StoryObj } from '@storybook/react-vite'
import { Text } from './Text'

const meta = {
  title: 'Atoms/Text',
  component: Text,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'body',
        'bodySmall',
        'caption',
        'overline',
      ],
    },
    color: {
      control: 'select',
      options: [
        'primary',
        'secondary',
        'accent',
        'error',
        'success',
        'warning',
      ],
    },
    weight: {
      control: 'select',
      options: ['regular', 'medium', 'bold', 'black'],
    },
    align: {
      control: 'select',
      options: ['left', 'center', 'right'],
    },
    as: {
      control: 'select',
      options: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'div'],
    },
  },
} satisfies Meta<typeof Text>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: 'Default text content',
  },
}

export const Headings: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Text variant="h1">Heading 1</Text>
      <Text variant="h2">Heading 2</Text>
      <Text variant="h3">Heading 3</Text>
      <Text variant="h4">Heading 4</Text>
      <Text variant="h5">Heading 5</Text>
      <Text variant="h6">Heading 6</Text>
    </div>
  ),
}

export const BodyText: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Text variant="body">Regular body text for content</Text>
      <Text variant="bodySmall">Small body text for secondary content</Text>
      <Text variant="caption">Caption text for labels and descriptions</Text>
      <Text variant="overline">OVERLINE TEXT FOR CATEGORIES</Text>
    </div>
  ),
}

export const Colors: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Text color="primary">Primary text color</Text>
      <Text color="secondary">Secondary text color</Text>
      <Text color="accent">Accent text color</Text>
      <Text color="error">Error text color</Text>
      <Text color="success">Success text color</Text>
      <Text color="warning">Warning text color</Text>
    </div>
  ),
}

export const Weights: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Text weight="regular">Regular weight text</Text>
      <Text weight="medium">Medium weight text</Text>
      <Text weight="bold">Bold weight text</Text>
      <Text weight="black">Black weight text</Text>
    </div>
  ),
}

export const Alignment: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-full">
      <Text align="left">Left aligned text</Text>
      <Text align="center">Center aligned text</Text>
      <Text align="right">Right aligned text</Text>
    </div>
  ),
}

export const SemanticElements: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Text as="h1" variant="h1">
        H1 element with h1 styling
      </Text>
      <Text as="p" variant="body">
        Paragraph element with body styling
      </Text>
      <Text as="span" variant="caption">
        Span element with caption styling
      </Text>
      <Text as="div" variant="overline">
        Div element with overline styling
      </Text>
    </div>
  ),
}

export const ContentExample: Story = {
  render: () => (
    <div className="max-w-2xl space-y-4">
      <Text variant="h2" color="primary">
        Welcome to our platform
      </Text>
      <Text variant="body" color="secondary">
        This is a longer paragraph of text that demonstrates how the Text
        component handles regular content. It shows proper line height, spacing,
        and readability for body content.
      </Text>
      <Text variant="bodySmall" color="secondary">
        Additional details or secondary information can be displayed using
        smaller text variants.
      </Text>
      <Text variant="caption" color="accent">
        Last updated: March 2024
      </Text>
    </div>
  ),
}
