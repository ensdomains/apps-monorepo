import { Link } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import { getNormalizedName } from '@/utils/token/isNormalized'

type NonNormalizedNameWarningProps = {
  readonly name: string
}

/**
 * Shown instead of a name's pages when the URL spelling is not a valid ENS
 * name. A non-normalised label can still be registered as a token of its own,
 * but clients normalise before resolving, so it never resolves as itself and
 * its look-alike is mostly a scam vector (WEB-2022).
 */
export const NonNormalizedNameWarning = ({
  name,
}: NonNormalizedNameWarningProps) => {
  const normalized = getNormalizedName(name)
  const suggestion = normalized && normalized !== name ? normalized : null

  return (
    <section
      aria-labelledby="non-normalized-name-title"
      className="flex items-start gap-3 self-stretch rounded-sm bg-message-danger-fill p-6"
    >
      <AlertTriangle className="mt-0.5 size-6 shrink-0 text-message-danger-text" />
      <div className="flex flex-col gap-3">
        <h1
          id="non-normalized-name-title"
          className="text-h1 text-message-danger-text"
        >
          This name is not valid in ENS
        </h1>
        <p className="text-p text-message-danger-text">
          <strong className="break-all">{name}</strong> is not written in its
          normalized form, so it is not a valid ENS name.
        </p>
        <p className="text-p text-message-danger-text">
          It will not resolve anywhere. Apps and wallets will not treat it as
          the name it looks like: any owner or records it has belong to a
          different token. Names like this are often used to impersonate others,
          so it can’t be viewed or managed here.
        </p>
        {suggestion && (
          <p className="text-p text-message-danger-text">
            Its normalized spelling,{' '}
            <Link
              to="/$name"
              params={{ name: suggestion }}
              className="break-all underline decoration-dotted font-medium"
            >
              {suggestion}
            </Link>
            , is a separate name that may have a different owner.
          </p>
        )}
      </div>
    </section>
  )
}
