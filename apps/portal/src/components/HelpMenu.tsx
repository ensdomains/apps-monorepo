import { ExternalLink } from 'react-external-link'

export const HelpMenu = () => {
  return (
    <div className="flex flex-col gap-1">
      <ExternalLink
        className="flex flex-row items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-gray-100 transition-colors"
        href="https://app.ens.domains/legal/terms-of-use"
      >
        Terms of Use
      </ExternalLink>
      <ExternalLink
        className="flex flex-row items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-gray-100 transition-colors"
        href="https://app.ens.domains/legal/privacy-policy"
      >
        Privacy Policy
      </ExternalLink>
      <ExternalLink
        className="flex flex-row items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-gray-100 transition-colors"
        href="https://ens.domains/legal/trademark-guidelines"
      >
        Trademark Guidelines
      </ExternalLink>
      <ExternalLink
        className="flex flex-row items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-gray-100 transition-colors"
        href="https://support.ens.domains/en/"
      >
        Support
      </ExternalLink>
    </div>
  )
}
