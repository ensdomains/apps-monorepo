import type { Meta, StoryObj } from '@storybook/react-vite'
import { FormField } from './FormField'

const meta = {
  title: 'Molecules/FormField',
  component: FormField,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'tel', 'url', 'number', 'search'],
    },
    variant: {
      control: 'select',
      options: ['default', 'error', 'success'],
    },
    required: {
      control: 'boolean',
    },
    disabled: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof FormField>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    label: 'Email Address',
    name: 'email',
    placeholder: 'Enter your email',
  },
}

export const Required: Story = {
  args: {
    label: 'Full Name',
    name: 'fullName',
    placeholder: 'Enter your full name',
    required: true,
  },
}

export const WithHelperText: Story = {
  args: {
    label: 'Username',
    name: 'username',
    placeholder: 'Choose a username',
    helperText:
      'Must be at least 3 characters long and contain only letters and numbers',
  },
}

export const WithError: Story = {
  args: {
    label: 'Password',
    name: 'password',
    type: 'password',
    placeholder: 'Enter password',
    errorText: 'Password must be at least 8 characters long',
  },
}

export const DifferentTypes: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <FormField
        label="Email"
        name="email"
        type="email"
        placeholder="your@email.com"
      />
      <FormField
        label="Phone Number"
        name="phone"
        type="tel"
        placeholder="+1 (555) 123-4567"
      />
      <FormField
        label="Website"
        name="website"
        type="url"
        placeholder="https://example.com"
      />
      <FormField label="Age" name="age" type="number" placeholder="25" />
      <FormField
        label="Search"
        name="search"
        type="search"
        placeholder="Search domains..."
      />
    </div>
  ),
}

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <FormField
        label="Search Domain"
        name="search"
        placeholder="Search for a domain..."
        startIcon={<span>🔍</span>}
      />
      <FormField
        label="Email Address"
        name="email"
        type="email"
        placeholder="your@email.com"
        endIcon={<span>📧</span>}
      />
    </div>
  ),
}

export const FormExample: Story = {
  render: () => (
    <div className="max-w-md space-y-4">
      <h3 className="font-semibold text-lg">Registration Form</h3>
      <FormField
        label="First Name"
        name="firstName"
        placeholder="John"
        required
      />
      <FormField label="Last Name" name="lastName" placeholder="Doe" required />
      <FormField
        label="Email"
        name="email"
        type="email"
        placeholder="john@example.com"
        required
        helperText="We'll never share your email"
      />
      <FormField
        label="Password"
        name="password"
        type="password"
        placeholder="Enter a secure password"
        required
        helperText="Must be at least 8 characters"
      />
      <FormField
        label="Confirm Password"
        name="confirmPassword"
        type="password"
        placeholder="Confirm your password"
        required
      />
    </div>
  ),
}

export const ValidationStates: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <FormField
        label="Valid Field"
        name="valid"
        placeholder="This field is valid"
        variant="success"
      />
      <FormField
        label="Error Field"
        name="error"
        placeholder="This field has an error"
        variant="error"
        errorText="This field is required"
      />
      <FormField
        label="Normal Field"
        name="normal"
        placeholder="This is a normal field"
      />
    </div>
  ),
}

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <FormField
        label="Disabled Field"
        name="disabled"
        placeholder="This field is disabled"
        disabled
      />
      <FormField
        label="Disabled with Value"
        name="disabledValue"
        value="Cannot edit this"
        disabled
      />
    </div>
  ),
}
