import { formatForDisplay } from '@tanstack/react-hotkeys'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCommandPalette } from './context'

export const PaletteTrigger = ({
  iconOnly = false,
  className,
  onOpen,
}: {
  readonly iconOnly?: boolean
  readonly className?: string
  readonly onOpen?: () => void
}) => {
  const { openPalette } = useCommandPalette()
  return (
    <Button
      type="button"
      variant="ghost"
      size={iconOnly ? 'icon' : 'default'}
      className={cn(
        'gap-2 text-muted-foreground',
        iconOnly
          ? 'size-9'
          : 'w-full justify-start rounded-sm bg-sidebar-accent px-3 font-normal',
        className,
      )}
      aria-label="Search names, addresses, and actions"
      onClick={onOpen ?? (() => openPalette())}
    >
      <Search className="size-4 shrink-0" />
      {!iconOnly && (
        <>
          <span className="min-w-0 flex-1 truncate text-left">
            Search and actions
          </span>
          <kbd className="hidden rounded border px-1 text-small text-muted-foreground md:inline-flex">
            {formatForDisplay('Mod+K')}
          </kbd>
        </>
      )}
    </Button>
  )
}
