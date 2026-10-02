import { ArrowUpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ENSV2_LEARN_MORE_URL,
  MANAGER_MIGRATE_URL,
} from '@/lib/constants/domain'

/**
 * Learn more plus Upgrade to v2, the pair every migration prompt offers.
 * `learnMore` drops the first button where there is only room for one;
 * `isWrapped` relabels the upgrade for a name that is unwrapped on the way.
 */
export const UpgradeActions = ({
  name,
  learnMore = true,
  isWrapped = false,
}: {
  readonly name: string
  readonly learnMore?: boolean
  readonly isWrapped?: boolean
}) => (
  <div className="flex shrink-0 items-center gap-4">
    {learnMore && (
      <Button className="rounded-xs" asChild variant="entity-outline" size="xs">
        {/** biome-ignore lint/a11y/noAmbiguousAnchorText: aria-label is used */}
        <a
          href={ENSV2_LEARN_MORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Learn more about migrating ${name} to ENS v2`}
        >
          Learn more
        </a>
      </Button>
    )}
    <Button className="rounded-xs" asChild variant="entity" size="xs">
      <a href={MANAGER_MIGRATE_URL} target="_blank" rel="noopener noreferrer">
        <ArrowUpCircle className="size-4 shrink-0" />
        {isWrapped ? 'Unwrap and upgrade' : 'Upgrade to v2'}
      </a>
    </Button>
  </div>
)
