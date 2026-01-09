# React and UI

Guidelines for building React components, styling with Tailwind CSS, routing, and accessibility.

> **See also**: [README.md](./README.md) for core principles | [STATE-AND-DATA.md](./STATE-AND-DATA.md) for state management and data fetching.

## Table of Contents

- [React Patterns](#react-patterns)
- [Component Composition](#component-composition)
- [Styling with Tailwind CSS](#styling-with-tailwind-css)
- [Routing with TanStack Router](#routing-with-tanstack-router)
- [Accessibility](#accessibility)

## React Patterns

### Component Definition

**Use arrow functions for React components:**

```typescript
// Good - Arrow function export (standard pattern)
export const ProfileCard = ({ name, address }: ProfileCardProps) => {
  return (
    <div>
      <h2>{name}</h2>
      <p>{address}</p>
    </div>
  )
}

// Good - Inline arrow function for router components
export const Route = createRootRoute({
  component: () => <Outlet />,
})

// Avoid - Function declaration for components (use for utilities only)
export function ProfileCard({ name, address }: ProfileCardProps) {
  return <div>...</div>
}

// Avoid - Function expression
export const ProfileCard = function({ name, address }: ProfileCardProps) {
  return <div>...</div>
}
```

**Note**: Function declarations (`function`) are reserved for utility functions and helpers, not React components.

### Component Props

Define props interfaces next to the component:

```typescript
// Good - Named interface with arrow function
interface ProfileCardProps {
  readonly name: string
  readonly address: Address
  readonly onEdit?: () => void
}

export const ProfileCard = ({ name, address, onEdit }: ProfileCardProps) => {
  return <div>...</div>
}

// Good - Inline type for simple components
export const Button = ({
  children,
  variant = 'default',
  ...props
}: React.ComponentProps<'button'> & { variant?: 'default' | 'outline' }) => {
  return <button {...props}>{children}</button>
}

// Good - Destructuring with type annotation
export const NameProfileCard = ({ name }: { name: string }) => {
  return <div>{name}</div>
}
```

### Pattern Matching for Conditional Rendering (🟡 Default)

Use `ts-pattern` for complex conditional logic over ternaries or `&&` operators:

> **Performance Note**: `ts-pattern` has some overhead due to JIT compilation ([benchmark details](https://github.com/bdbaraban/ts-pattern-benchmark/pull/1)). For simple conditions or hot paths, native conditionals may be faster. Measure if performance is critical (see [Performance Guidelines](#performance-guidelines)).

```typescript
import { match } from 'ts-pattern'
import { P } from 'ts-pattern'

// Good - Explicit pattern matching
export const ProfileStatus = ({ status }: { status: ProfileStatus }) => {
  return match(status)
    .with({ type: 'loading' }, () => <LoadingSpinner />)
    .with({ type: 'error', error: P.select() }, (error) => (
      <ErrorMessage error={error} />
    ))
    .with({ type: 'success', data: P.select() }, (data) => (
      <ProfileCard profile={data} />
    ))
    .exhaustive()
}

// Avoid - Nested ternaries
export const ProfileStatus = ({ status }) => {
  return status.type === 'loading' 
    ? <LoadingSpinner />
    : status.type === 'error'
    ? <ErrorMessage error={status.error} />
    : <ProfileCard profile={status.data} />
}

// Avoid - && operators with potential falsy bugs
export const ShowPrice = ({ price }) => {
  return price && <div>Price: {price}</div>  // Breaks if price is 0
}

// Good - Explicit nullish check
export const ShowPrice = ({ price }: { price: bigint | null }) => {
  return match({ price })
    .with({ price: P.not(P.nullish) }, ({ price }) => (
      <div>Price: {formatEther(price!)}</div>
    ))
    .otherwise(() => null)
}
```

### Extract Static Values and Pure Functions

Keep component bodies clean by extracting static values:

```typescript
// Avoid - Recreated on every render
export const RegistrationForm = () => {
  const YEAR_IN_SECONDS = 31536000n
  const config = {
    minDuration: YEAR_IN_SECONDS,
    maxDuration: YEAR_IN_SECONDS * 10n,
  }
  
  const calculatePrice = (duration: bigint) => {
    // calculation logic
  }
  
  return <form>...</form>
}

// Good - Extracted outside component
const YEAR_IN_SECONDS = 31536000n

const REGISTRATION_CONFIG = {
  minDuration: YEAR_IN_SECONDS,
  maxDuration: YEAR_IN_SECONDS * 10n,
} as const

function calculateRegistrationPrice(
  baseFee: bigint,
  duration: bigint
): bigint {
  return baseFee * duration / YEAR_IN_SECONDS
}

export const RegistrationForm = () => {
  return <form>...</form>
}
```

### Never Use useEffect for Data Fetching 🔴 Must

**Always use TanStack Query for data fetching** - never fetch data in `useEffect`.

```typescript
// ❌ NEVER DO THIS - Data fetching in useEffect
export const ProfilePage = ({ name }: { name: string }) => {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  useEffect(() => {
    let cancelled = false
    
    async function fetchProfile() {
      setLoading(true)
      try {
        const result = await getProfile(name)
        if (!cancelled && result.isOk()) {
          setProfile(result.value)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e as Error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    
    fetchProfile()
    return () => { cancelled = true }
  }, [name])
  
  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage error={error} />
  return <ProfileView profile={profile} />
}

// ✅ ALWAYS DO THIS - Use TanStack Query
export const ProfilePage = ({ name }: { name: string }) => {
  const { data: profile, isLoading, error } = useQuery(getProfileQueryOptions(name))
  
  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorMessage error={error} />
  if (!profile) return null
  return <ProfileView profile={profile} />
}
```

**Why useEffect is problematic for data fetching:**
- ❌ **Waterfalls** - Dependencies cause sequential fetches
- ❌ **Race conditions** - React 18+ concurrent mode can race effects
- ❌ **No caching** - Same data fetched multiple times
- ❌ **Messy error handling** - Manual state management
- ❌ **No retry logic** - Must implement yourself
- ❌ **No stale data** - Can't show stale while revalidating

**TanStack Query solves all of these** - use it for ALL data fetching.

### useEffect Usage Policy (🟡 Default)

**Default rule**: Extract `useEffect` into a named custom hook to document intent and keep components readable.

**Valid use cases for useEffect:**
- DOM manipulation (focus, scroll, resize observers)
- Setting up/tearing down subscriptions
- Syncing with external systems (localStorage, WebSocket)
- Side effects triggered by prop/state changes

```typescript
// ❌ AVOID: Naked useEffect in component
export const ModalComponent = ({ isOpen }: { isOpen: boolean }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])
  
  return <div>...</div>
}

// ✅ CORRECT: Extract into named hook
function useLockBodyScroll(isLocked: boolean) {
  useEffect(() => {
    if (isLocked) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isLocked])
}

export const ModalComponent = ({ isOpen }: { isOpen: boolean }) => {
  useLockBodyScroll(isOpen)
  return <div>...</div>
}

export const ProfilePage = ({ name }: { name: string }) => {
  const [profile, setProfile] = useState<Profile | null>(null)
  
  useProfileData(name, setProfile)
  
  return <div>...</div>
}
```

**Why extract effects?**
- Hook name documents the purpose
- Component body stays focused on rendering
- Effects are testable independently
- Easier to reuse across components

**Allowed exceptions** (must stay trivial):
- ≤ 5 lines of code
- No async logic
- No branching (if/switch)
- No external dependencies

```typescript
// ✅ Acceptable: Simple DOM sync effect
export const AutoFocusInput = () => {
  const ref = useRef<HTMLInputElement>(null)
  
  useEffect(() => {
    ref.current?.focus()
  }, [])
  
  return <input ref={ref} />
}
```

**If an effect grows beyond these constraints, extract it immediately.**

### Component Size and Complexity (🟢 Guideline)

**Split components based on complexity, not arbitrary line counts.**

**When to split:**
- ✅ Component has multiple concerns (data fetching + rendering + form logic)
- ✅ Logic is reusable across multiple parents
- ✅ Component is hard to understand due to complexity (not size)
- ✅ Different parts change for different reasons

**When NOT to split:**
- ❌ Component is mostly static JSX (navigation would take longer than reading)
- ❌ Split components are 50% type definitions and props drilling
- ❌ You're only splitting to hit a line count target

```typescript
// ❌ Over-split - Harder to follow, mostly definitions
const ProfileHeader = ({ name, avatar }: ProfileHeaderProps) => {
  return (
    <header className="flex items-center gap-4">
      <Avatar src={avatar} />
      <h1>{name}</h1>
    </header>
  )
}

// ✅ Good - Split when there's actual complexity
const ProfileRecordsEditor = ({ records, onChange }: Props) => {
  const [editMode, setEditMode] = useState(false)
  const { writeContractAsync } = useWriteContract()
  
  const handleSave = async () => {
    // 30+ lines of validation, encoding, transaction logic
  }
  
  return editMode ? <Editor /> : <Display />
}

const ProfilePage = ({ name }: ProfilePageProps) => {
  const { data: profile } = useQuery(getProfileQueryOptions(name))
  
  return (
    <div>
      {/* ✅ Static header stays inline - easy to read */}
      <header className="flex items-center gap-4">
        <Avatar src={profile.avatar} />
        <h1>{profile.name}</h1>
      </header>
      
      {/* ✅ Complex editor extracted - manages its own state and logic */}
      <ProfileRecordsEditor 
        records={profile.records}
        onChange={handleUpdate}
      />
    </div>
  )
}
```

**Rule of thumb**: If finding the split component takes longer than scanning the original, don't split it.

### Avoid Prop Drilling 🟡 Default

**Don't pass props through intermediate components just to reach a deeply nested child.** Use hooks or context to access data where it's needed.

```typescript
// ❌ AVOID - Prop drilling
function Page() {
  const user = useUser()
  return <Sidebar user={user} />
}

function Sidebar({ user }: { user: User }) {
  return (
    <div>
      <Navigation />
      <ProfileCard user={user} />
    </div>
  )
}

function ProfileCard({ user }: { user: User }) {
  return <div>{user.name}</div>
}

// ✅ CORRECT - Access data where needed
function Page() {
  return <Sidebar />
}

function Sidebar() {
  return (
    <div>
      <Navigation />
      <ProfileCard />
    </div>
  )
}

function ProfileCard() {
  const user = useUser() // Get data directly
  return <div>{user.name}</div>
}
```

**When to use each approach:**

✅ **Use hooks/context for app state:**
- User authentication
- Theme/locale
- Global feature flags
- Data used in multiple places

✅ **Pass props for component-specific data:**
- Direct parent-child communication
- Props that configure component behavior
- Data that flows naturally down one level

❌ **Don't prop drill:**
- Through 3+ component levels
- For data that's not used by intermediate components
- For global app state

**Benefits:**
- ✅ **Less coupling** - Components don't depend on parent structure
- ✅ **Easier refactoring** - Move components without updating props
- ✅ **Clearer intent** - Each component declares what it needs
- ✅ **Better composition** - Intermediate components stay simple

## Component Composition

### Composition Over Configuration

Build flexible components through composition:

```typescript
// Good - Composition
export const ProfilePage = ({ name }: { name: string }) => {
  const { data: profile } = useQuery(getProfileQueryOptions(name))
  
  return (
    <Card>
      <CardHeader>
        <Avatar src={profile.avatar} />
        <h1>{profile.name}</h1>
      </CardHeader>
      <CardBody>
        <ProfileRecords records={profile.records} />
      </CardBody>
      <CardFooter>
        <Button onClick={handleEdit}>Edit</Button>
      </CardFooter>
    </Card>
  )
}

// Avoid - Configuration props
export const ProfileCard = ({
  profile,
  showAvatar,
  showRecords,
  showEditButton,
  onEdit,
}: ProfileCardProps) => {
  return (
    <div>
      {showAvatar && <Avatar />}
      {showRecords && <Records />}
      {showEditButton && <Button onClick={onEdit} />}
    </div>
  )
}
```

### Using Radix UI Primitives

```typescript
import * as Dialog from '@radix-ui/react-dialog'

// Good - Compose Radix primitives with custom styling
export const EditProfileDialog = ({ children }: { children: React.ReactNode }) => {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button>Edit Profile</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Dialog.Title>Edit Profile</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

### Render Props Pattern

```typescript
// Good - Render prop for flexibility
interface DataTableProps<T> {
  data: readonly T[]
  renderRow: (item: T) => React.ReactNode
  renderEmpty?: () => React.ReactNode
}

export const DataTable = <T,>({ data, renderRow, renderEmpty }: DataTableProps<T>) => {
  if (data.length === 0) {
    return renderEmpty?.() ?? <p>No data</p>
  }
  
  return (
    <table>
      <tbody>
        {data.map((item, index) => (
          <tr key={index}>{renderRow(item)}</tr>
        ))}
      </tbody>
    </table>
  )
}

// Usage
<DataTable
  data={profiles}
  renderRow={(profile) => (
    <>
      <td>{profile.name}</td>
      <td>{profile.address}</td>
    </>
  )}
/>
```

## Styling with Tailwind CSS

### Utility-First Approach

```typescript
// Good - Utility classes
export const Button = ({ children }: { children: React.ReactNode }) => {
  return (
    <button className="rounded-sm bg-primary px-4 py-2 text-white hover:bg-primary/90">
      {children}
    </button>
  )
}
```

### Component Variants with CVA

Use `class-variance-authority` for type-safe variants:

```typescript
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-sm font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary text-white hover:bg-primary/90',
        outline: 'border border-input bg-background hover:bg-accent',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3',
        lg: 'h-10 px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

interface ButtonProps 
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {}

export const Button = ({ className, variant, size, ...props }: ButtonProps) => {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}
```

> **Note**: For complex multi-part components (e.g., Card with separate Header, Body, Footer styles), consider [tailwind-variants](https://www.tailwind-variants.org/) which extends CVA with slots and built-in class merging. For single-part components, CVA + `cn()` is sufficient.

### Conditional Classes

Use the `cn` utility for conditional classes:

```typescript
import { cn } from '@/lib/utils'

export const Card = ({ isActive, className }: CardProps) => {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        isActive && 'border-primary bg-primary/5',
        className
      )}
    >
      ...
    </div>
  )
}
```

### Choose One Class Helper 🟡 Default

**Pick either `cn` or `tw` and use it consistently across the codebase.**

```typescript
// Option 1: cn (clsx + tailwind-merge)
import { cn } from '@/lib/utils'

<Button className={cn('px-4 py-2', isActive && 'bg-primary')} />

// Option 2: tw (tailwind-variants)
import { tw } from '@/lib/utils'

<Button className={tw`px-4 py-2 ${isActive ? 'bg-primary' : ''}`} />
```

**Benefits of consistency:**
- ✅ **One import** - Team knows where to look
- ✅ **Better IDE support** - Configure once
- ✅ **Easier onboarding** - One pattern to learn
- ✅ **Biome integration** - `useSortedClasses` works with `tw` helper

### Avoid Arbitrary Values 🟡 Default

**Use design system tokens instead of arbitrary values.** Only use arbitrary values when justified.

```typescript
// ❌ AVOID - Arbitrary values break design system
<div className="w-[37px] h-[23px] text-[#3B82F6]" />

// ✅ CORRECT - Use design tokens
<div className="size-9 text-blue-500" />
<div className="w-8 h-6 text-primary" />

// ✅ ACCEPTABLE - When design system doesn't have the value
// Always leave a comment explaining why
<div 
  className="w-[120px]" // Specific width needed to align with external component
/>
```

**Why avoid arbitrary values:**
- ❌ **Breaks consistency** - Diverges from design system
- ❌ **Hard to maintain** - Magic numbers scattered everywhere
- ❌ **No type safety** - Easy to make typos
- ❌ **Larger bundle** - Each arbitrary value adds CSS

**When arbitrary values are justified:**
- ✅ Interfacing with third-party components with fixed dimensions
- ✅ Dynamic values from props/API that can't use tokens
- ✅ One-off exceptions that don't fit the design system (document why!)

**Always ask**: "Could this use a design token instead?"

### Icon Sizing with Lucide

```typescript
import { CalendarIcon } from 'lucide-react'

// Good - Use Tailwind size classes
<CalendarIcon className="size-4" />
<CalendarIcon className="size-3.5" />
<CalendarIcon className="size-6" />

// Avoid - Don't use props
<CalendarIcon width={16} height={16} />
<CalendarIcon size={16} />
```

## Routing with TanStack Router

### File-Based Routing

TanStack Router uses file-based routing:

```
routes/
├── __root.tsx              # Root layout
├── index.tsx               # / route
├── $name.tsx               # /:name route
└── $name/
    ├── records.tsx         # /:name/records
    └── history.tsx         # /:name/history
```

### Route Definition

```typescript
// routes/$name.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$name')({
  // Type-safe params
  validateSearch: (search) => ({
    tab: (search.tab as 'profile' | 'records') || 'profile',
  }),
  
  // Load data before rendering
  loader: async ({ params: { name } }) => {
    return await getProfile(name)
  },
  
  // Component
  component: function NamePage() {
    const { name } = Route.useParams()
    const { tab } = Route.useSearch()
    
    return <div>...</div>
  },
})
```

### Navigation

```typescript
import { Link, useNavigate } from '@tanstack/react-router'

export const Navigation = () => {
  const navigate = useNavigate()
  
  return (
    <nav>
      {/* Type-safe Link */}
      <Link to="/$name" params={{ name: 'vitalik.eth' }}>
        View Profile
      </Link>
      
      {/* Programmatic navigation */}
      <button
        onClick={() => {
          navigate({
            to: '/$name',
            params: { name: 'vitalik.eth' },
            search: { tab: 'records' },
          })
        }}
      >
        Go to Records
      </button>
    </nav>
  )
}
```

## Accessibility

### Semantic HTML

Use semantic HTML elements:

```typescript
// Good
<nav>
  <ul>
    <li><a href="/">Home</a></li>
  </ul>
</nav>

<main>
  <article>
    <h1>Title</h1>
    <p>Content</p>
  </article>
</main>

// Avoid
<div className="nav">
  <div className="nav-list">
    <div><span onClick={goHome}>Home</span></div>
  </div>
</div>
```

### ARIA Attributes

```typescript
// Good - Accessible button
<button
  type="button"
  aria-label="Close dialog"
  aria-pressed={isPressed}
>
  <XIcon className="size-4" />
</button>

// Good - Accessible form
<form>
  <label htmlFor="name-input">
    ENS Name
  </label>
  <input
    id="name-input"
    type="text"
    aria-describedby="name-help"
    aria-invalid={hasError}
  />
  <p id="name-help">Enter your ENS name</p>
</form>
```

### Keyboard Navigation

Ensure all interactive elements are keyboard accessible:

```typescript
export const MenuItem = ({ onClick }: { onClick: () => void }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      Menu Item
    </button>
  )
}
```

---

> **Next**: See [STATE-AND-DATA.md](./STATE-AND-DATA.md) for state management, error handling, and data fetching patterns.
