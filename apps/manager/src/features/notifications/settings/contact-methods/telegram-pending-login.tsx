import { Trans, useLingui } from '@lingui/react/macro'
import { CopyIcon, ExternalLinkIcon, Loader2Icon } from 'lucide-react'
import { fromPromise } from 'neverthrow'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  getTelegramContinueUrl,
  type TelegramOpeningStrategy,
} from '@/features/notifications/utils/telegram/browser'
import { copyToClipboard } from '@/lib/clipboard'

export const TelegramPendingLogin = ({
  authorizationUrl,
  strategy,
  isCancelling,
  onCancel,
}: {
  readonly authorizationUrl?: string
  readonly strategy: TelegramOpeningStrategy
  readonly isCancelling: boolean
  readonly onCancel: () => void
}) => {
  const { t } = useLingui()
  const isSafariHandoff = strategy === 'safari'
  return (
    <div className="space-y-3 rounded-lg border border-ens-lapis-dust bg-ens-lapis-tint p-4 text-ens-lapis-dense">
      <div className="flex items-center gap-2 font-medium">
        <Loader2Icon
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
        />
        <Trans>Waiting for Telegram</Trans>
      </div>
      <p className="text-ens-quartz-550 leading-relaxed">
        {isSafariHandoff ? (
          <Trans>
            Open Safari to finish connecting Telegram, then return here. Keep
            ENS Manager open in MetaMask.
          </Trans>
        ) : strategy === 'copy-link' ? (
          <Trans>
            Copy the sign-in link, open your browser and paste it into the
            address bar. Complete Telegram sign-in, then return here. Keep ENS
            Manager open in MetaMask.
          </Trans>
        ) : (
          <Trans>
            Continue to Telegram if sign-in did not open automatically. You can
            keep using ENS Manager, or copy the sign-in link to another browser
            and return here afterward.
          </Trans>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {authorizationUrl && (
          <>
            {strategy !== 'copy-link' && (
              <Button asChild size="sm" variant="outline">
                <a
                  href={getTelegramContinueUrl(authorizationUrl, strategy)}
                  rel="noopener noreferrer"
                  target={isSafariHandoff ? undefined : '_blank'}
                >
                  {isSafariHandoff ? (
                    <Trans>Open in Safari</Trans>
                  ) : (
                    <Trans>Continue to Telegram</Trans>
                  )}
                  <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
                </a>
              </Button>
            )}
            <Button
              onClick={() => {
                if (!authorizationUrl) return
                void fromPromise(
                  copyToClipboard(authorizationUrl),
                  () => undefined,
                ).match(
                  () =>
                    toast.success(
                      t`Sign-in link copied. Open it in your browser, then return here.`,
                    ),
                  () =>
                    toast.error(
                      t`Could not copy the sign-in link. Please try again.`,
                    ),
                )
              }}
              size="sm"
              type="button"
              variant={strategy === 'copy-link' ? 'blue' : 'outline'}
            >
              <Trans>Copy sign-in link</Trans>
              <CopyIcon aria-hidden="true" className="size-3.5" />
            </Button>
          </>
        )}
        <Button
          disabled={isCancelling}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Trans>Cancel connection</Trans>
        </Button>
      </div>
    </div>
  )
}
