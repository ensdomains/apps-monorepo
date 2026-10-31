import { cn } from '@/lib/utils'
import { CopyButton } from './CopyButton'
import { nameHeadingClassName, PageHeading } from './PageHeading'

/**
 * Name overview `h1` with a copy button outside the heading text. Inline flow
 * keeps the button after the last line when a long name wraps.
 */
export const NameHeading = ({ name }: { readonly name: string }) => (
  <div className="min-w-0">
    <PageHeading className={cn(nameHeadingClassName, 'inline')}>
      {name}
    </PageHeading>
    <CopyButton value={name} className="ml-1 align-middle" />
  </div>
)
