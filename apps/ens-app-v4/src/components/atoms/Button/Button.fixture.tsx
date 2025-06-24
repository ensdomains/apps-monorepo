import { Button } from './Button'

export default {
  Default: <Button>Default Button</Button>,

  Variants: (
    <div className="flex flex-wrap gap-4">
      <Button variant="default">Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
      <Button variant="destructive">Destructive</Button>
    </div>
  ),

  Sizes: (
    <div className="flex flex-wrap items-center gap-4">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon">📧</Button>
    </div>
  ),

  States: (
    <div className="flex flex-wrap gap-4">
      <Button>Normal</Button>
      <Button disabled>Disabled</Button>
      <Button loading>Loading</Button>
    </div>
  ),

  WithIcons: (
    <div className="flex flex-wrap gap-4">
      <Button startIcon={<span>📧</span>}>With Start Icon</Button>
      <Button endIcon={<span>➡️</span>}>With End Icon</Button>
      <Button startIcon={<span>📧</span>} endIcon={<span>➡️</span>}>
        Both Icons
      </Button>
    </div>
  ),

  FullWidth: (
    <div className="w-full max-w-md">
      <Button fullWidth>Full Width Button</Button>
    </div>
  ),

  Interactive: (
    <Button onClick={() => alert('Button clicked!')}>Click Me!</Button>
  ),
}
