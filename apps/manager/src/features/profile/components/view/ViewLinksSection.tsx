import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ProfileRecords } from '../../types'

interface ViewLinksSectionProps {
  records: ProfileRecords
}

export const ViewLinksSection = ({ records }: ViewLinksSectionProps) => {
  return (
    <div className="space-y-2">
      <div className="font-medium">Links</div>
      {records.links.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {records.links.map((link, i) => (
            <Button
              asChild
              className="w-full min-w-1/3 flex-1 justify-between"
              key={`${link.name}-${i}`}
              size="sm"
              variant="outline"
            >
              <a
                className="flex w-full min-w-0 items-center justify-between gap-2"
                href={link.url}
                rel="noopener noreferrer"
                target="_blank"
                title={link.url}
              >
                <span className="truncate">{link.name}</span>
                <ExternalLink className="size-4" />
              </a>
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-gray-600 text-sm">No links added</p>
      )}
    </div>
  )
}
