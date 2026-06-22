import { Trans } from '@lingui/react/macro'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ProfileRecords } from '../../types'
import { safeHttpHref } from '../../utils/safeUrl'

interface ViewLinksSectionProps {
  records: ProfileRecords
}

export const ViewLinksSection = ({ records }: ViewLinksSectionProps) => {
  const safeLinks = records.links.flatMap((link) => {
    const href = safeHttpHref(link.url)
    return href ? [{ ...link, href }] : []
  })

  if (safeLinks.length === 0) {
    return null
  }

  return (
    <Card className="border-[0.25px] border-border bg-white shadow-none">
      <CardHeader>
        <CardTitle className="text-base tracking-tight">
          <Trans>Links</Trans>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {safeLinks.map((link) => (
            <Button
              asChild
              className="w-full min-w-1/3 flex-1 justify-between"
              key={`${link.name}-${link.href}`}
              size="sm"
              variant="outline"
            >
              <a
                className="flex w-full min-w-0 items-center justify-between gap-2"
                href={link.href}
                rel="noopener noreferrer"
                target="_blank"
                title={link.href}
              >
                <span className="truncate">{link.name}</span>
                <ExternalLink className="size-4" />
              </a>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
