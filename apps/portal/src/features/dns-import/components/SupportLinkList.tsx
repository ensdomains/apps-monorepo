import { ExternalLink } from 'lucide-react'

type SupportLinkListProps = {
  readonly title: string
  readonly items: readonly { readonly label: string; readonly href: string }[]
}

/** Registrar help links shown under a DNS check ("Need help? …"). */
export const SupportLinkList = ({ title, items }: SupportLinkListProps) => (
  <div className="flex flex-col gap-2">
    <p className="text-sm text-muted-foreground">{title}</p>
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.label}>
          <a
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm underline underline-offset-2 hover:opacity-80"
          >
            {item.label}
            <ExternalLink className="size-3" />
          </a>
        </li>
      ))}
    </ul>
  </div>
)
