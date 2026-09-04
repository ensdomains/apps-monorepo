import { ArrowUpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ENSV2_LEARN_MORE_URL,
  MANAGER_MIGRATE_URL,
} from '@/lib/constants/domain'

/** Learn more plus Upgrade to v2, the pair every migration prompt offers. */
export const UpgradeActions = ({ name }: { readonly name: string }) => (
  <div className="flex items-center gap-4">
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
    <Button className="rounded-xs" asChild variant="entity" size="xs">
      <a href={MANAGER_MIGRATE_URL} target="_blank" rel="noopener noreferrer">
        <ArrowUpCircle className="size-4 shrink-0" />
        Upgrade to v2
      </a>
    </Button>
  </div>
)
