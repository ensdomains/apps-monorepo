import { Link } from '@tanstack/react-router'
import { useRegistrationV2Context } from '../../machines/RegistrationV2UiContext'

export const RegistrationV2SuccessState = () => {
  const { label } = useRegistrationV2Context()
  const targetName = `${label}.eth`

  return (
    <section className="space-y-3 rounded border p-4">
      <p className="font-mono text-muted-foreground text-xs uppercase tracking-wide">
        success
      </p>
      <h1 className="font-semibold text-2xl">{targetName}</h1>
      <p className="text-muted-foreground text-sm">
        Registration completed. You can go to the profile or return to search.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          className="rounded border px-3 py-2 text-sm"
          params={{ name: targetName }}
          to="/p/$name"
        >
          View profile
        </Link>
        <Link className="rounded border px-3 py-2 text-sm" to="/">
          Back to search
        </Link>
      </div>
    </section>
  )
}
