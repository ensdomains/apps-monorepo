import type { ProfileRecords } from '../../types'

interface ViewLinksSectionProps {
  records: ProfileRecords
}

export const ViewLinksSection = ({ records }: ViewLinksSectionProps) => {
  return (
    <div className="space-y-2">
      <span className="font-medium">Links</span>
      {records.links.length > 0 ? (
        records.links.map((link, i) => (
          <div key={`${link.name}-${i}`} className="flex items-center gap-2">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 text-sm hover:underline"
            >
              {link.name}
            </a>
          </div>
        ))
      ) : (
        <p className="text-gray-600 text-sm">No links added</p>
      )}
    </div>
  )
}
