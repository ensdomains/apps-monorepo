import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ProfileRecords } from '../../types'

interface ViewLinksSectionProps {
  records: ProfileRecords
}

export const ViewLinksSection = ({ records }: ViewLinksSectionProps) => {
  return (
    <Card className="border-[0.25px] border-border bg-white shadow-none">
      <CardHeader>
        <CardTitle className="text-base tracking-tight">Links</CardTitle>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  )
}
