import { Trans } from '@lingui/react/macro'
import { LinkButton } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MSymbol } from '@/components/ui/material-symbol'
import { cn } from '@/lib/utils'

const DNS_TLD_DOCS_URL = 'https://docs.ens.domains/dns/tlds/'

// Beyond this the 20px nameplate can't fit the card on one line; the design
// switches to a full-width 12px multi-line nameplate stacked above the text.
const LONG_NAME_THRESHOLD = 32

export type NameFallbackReason =
  | 'unsupported-tld'
  | 'too-short'
  | 'not-found'
  | 'not-imported'

/**
 * Shown instead of a profile/registration flow for names the app can't
 * display or register: unsupported TLDs, labels too short to register,
 * nonexistent subnames, and unimported DNS names.
 */
export const NameFallbackCard = ({
  name,
  reason,
}: {
  readonly name: string
  readonly reason: NameFallbackReason
}) => {
  const isLongName = name.length > LONG_NAME_THRESHOLD

  return (
    <Card className="mx-auto mt-12 w-full-[32px] max-w-xl items-center gap-0 px-5 py-10 text-center sm:px-10 sm:py-12">
      <div className="flex w-full flex-col items-center gap-8">
        <div className="flex w-full flex-col items-center gap-3">
          <span
            className={cn(
              'wrap-anywhere rounded-[3px] bg-ens-lapis-500 p-2 font-medium font-semi-mono text-ens-white leading-ens-none tracking-tight',
              isLongName ? 'w-full text-xs' : 'text-center text-xl',
            )}
          >
            {name}
          </span>
          <span className="flex items-center gap-1 text-xl leading-ens-none tracking-tight">
            {reason === 'unsupported-tld' && (
              <>
                <Trans>uses an unsupported TLD</Trans>
                <a
                  aria-label="Supported TLD documentation"
                  href={DNS_TLD_DOCS_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  <MSymbol
                    className="ms-opsz-20 text-ens-lapis-500"
                    symbol="info"
                  />
                </a>
              </>
            )}
            {reason === 'too-short' && <Trans>is too short to register</Trans>}
            {reason === 'not-found' && <Trans>doesn't exist</Trans>}
            {reason === 'not-imported' && (
              <Trans>hasn't been imported to ENS yet</Trans>
            )}
          </span>
        </div>
        <LinkButton
          className="h-14 w-full"
          size="lg"
          to="/dashboard"
          variant="lightBlue"
        >
          <MSymbol className="ms-opsz-20" symbol="undo" />
          <Trans>Return to Dashboard</Trans>
        </LinkButton>
      </div>
    </Card>
  )
}
