import { Link } from '@tanstack/react-router'

interface RegistrationV2UnavailableStateProps {
  targetName: string
  message: string
}

export const RegistrationV2UnavailableState = ({
  targetName,
  message,
}: RegistrationV2UnavailableStateProps) => {
  return (
    <section className="space-y-4 rounded border p-4">
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
        unavailable
      </p>
      <h1 className="font-semibold text-2xl">{targetName}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="flex gap-2">
        <Link
          className="rounded border px-3 py-2 text-sm"
          to="/"
        >
          Back to search
        </Link>
        <Link
          className="rounded border px-3 py-2 text-sm"
          params={{ name: targetName }}
          to="/p/$name"
        >
          View profile
        </Link>
      </div>
    </section>
  )
}
