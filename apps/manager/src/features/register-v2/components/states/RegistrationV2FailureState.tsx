import { Link } from '@tanstack/react-router'
import {
  useRegistrationV2Context,
  useRegistrationV2Selector,
} from '@/features/register-v2/machines/RegistrationV2UiContext'

interface RegistrationV2FailureStateProps {
  targetName: string
}

export const RegistrationV2FailureState = ({
  targetName,
}: RegistrationV2FailureStateProps) => {
  const { uiActor } = useRegistrationV2Context()
  const message = useRegistrationV2Selector(
    (state) => state.context.lastErrorMessage,
  )

  return (
    <section className="space-y-4 rounded border p-4">
      <p className="font-mono text-muted-foreground text-xs uppercase tracking-wide">
        registration failed
      </p>
      <h1 className="font-semibold text-2xl">{targetName}</h1>
      <p className="text-muted-foreground text-sm">
        {message ?? 'The registration flow failed. You can retry or leave.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded border px-3 py-2 text-sm"
          onClick={() => uiActor.send({ type: 'RETRY' })}
          type="button"
        >
          Retry
        </button>
        <button
          className="rounded border px-3 py-2 text-sm"
          onClick={() => uiActor.send({ type: 'CANCEL' })}
          type="button"
        >
          Back to quote
        </button>
        <Link className="rounded border px-3 py-2 text-sm" to="/">
          Back to search
        </Link>
      </div>
    </section>
  )
}
