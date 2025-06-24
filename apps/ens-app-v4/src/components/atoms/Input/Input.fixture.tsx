import { Input } from './Input'

export default {
  Default: <Input placeholder="Enter text..." />,

  WithLabel: <Input label="Email Address" placeholder="your@email.com" />,

  Variants: (
    <div className="flex flex-col gap-4">
      <Input variant="default" placeholder="Default input" />
      <Input
        variant="error"
        placeholder="Error input"
        errorText="This field is required"
      />
      <Input variant="success" placeholder="Success input" />
    </div>
  ),

  Sizes: (
    <div className="flex flex-col gap-4">
      <Input size="sm" placeholder="Small input" />
      <Input size="default" placeholder="Default input" />
      <Input size="lg" placeholder="Large input" />
    </div>
  ),

  WithHelperText: (
    <Input
      label="Username"
      placeholder="Enter username"
      helperText="Must be at least 3 characters long"
    />
  ),

  WithError: (
    <Input
      label="Password"
      type="password"
      placeholder="Enter password"
      errorText="Password must be at least 8 characters"
    />
  ),

  WithIcons: (
    <div className="flex flex-col gap-4">
      <Input placeholder="Search..." startIcon={<span>🔍</span>} />
      <Input placeholder="Enter email..." endIcon={<span>📧</span>} />
      <Input
        placeholder="Both icons..."
        startIcon={<span>👤</span>}
        endIcon={<span>✅</span>}
      />
    </div>
  ),

  States: (
    <div className="flex flex-col gap-4">
      <Input placeholder="Normal state" />
      <Input placeholder="Disabled state" disabled />
      <Input placeholder="Required field" required />
    </div>
  ),

  FormExample: (
    <div className="flex flex-col gap-4 max-w-md">
      <Input label="First Name" placeholder="John" required />
      <Input label="Last Name" placeholder="Doe" required />
      <Input label="Email" type="email" placeholder="john@example.com" />
      <Input label="Phone" type="tel" placeholder="+1 (555) 123-4567" />
    </div>
  ),
}
