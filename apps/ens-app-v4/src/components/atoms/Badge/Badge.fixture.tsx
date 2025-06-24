import { Badge } from './Badge'

export default {
  Default: <Badge>Default Badge</Badge>,

  Variants: (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="destructive">Destructive</Badge>
    </div>
  ),

  CustomVariants: (
    <div className="flex flex-wrap gap-2">
      <Badge variant="available">Available</Badge>
      <Badge variant="unavailable">Unavailable</Badge>
      <Badge variant="premium">Premium</Badge>
    </div>
  ),

  Sizes: (
    <div className="flex flex-wrap items-center gap-2">
      <Badge size="sm">Small</Badge>
      <Badge size="default">Default</Badge>
      <Badge size="lg">Large</Badge>
    </div>
  ),

  DomainStatuses: (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span>example.eth</span>
        <Badge variant="available">Available</Badge>
      </div>
      <div className="flex items-center gap-2">
        <span>premium.eth</span>
        <Badge variant="premium">Premium</Badge>
      </div>
      <div className="flex items-center gap-2">
        <span>taken.eth</span>
        <Badge variant="unavailable">Unavailable</Badge>
      </div>
    </div>
  ),

  WithNumbers: (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">99+</Badge>
      <Badge variant="destructive">Error</Badge>
      <Badge variant="available">✓ Valid</Badge>
      <Badge variant="secondary">v2.1.0</Badge>
    </div>
  ),

  AllCombinations: (
    <div className="grid grid-cols-3 gap-4">
      <div>
        <h4 className="text-sm font-semibold mb-2">Small</h4>
        <div className="flex flex-col gap-1">
          <Badge size="sm" variant="default">
            Default
          </Badge>
          <Badge size="sm" variant="available">
            Available
          </Badge>
          <Badge size="sm" variant="premium">
            Premium
          </Badge>
        </div>
      </div>
      <div>
        <h4 className="text-sm font-semibold mb-2">Default</h4>
        <div className="flex flex-col gap-1">
          <Badge size="default" variant="default">
            Default
          </Badge>
          <Badge size="default" variant="available">
            Available
          </Badge>
          <Badge size="default" variant="premium">
            Premium
          </Badge>
        </div>
      </div>
      <div>
        <h4 className="text-sm font-semibold mb-2">Large</h4>
        <div className="flex flex-col gap-1">
          <Badge size="lg" variant="default">
            Default
          </Badge>
          <Badge size="lg" variant="available">
            Available
          </Badge>
          <Badge size="lg" variant="premium">
            Premium
          </Badge>
        </div>
      </div>
    </div>
  ),
}
