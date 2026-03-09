interface RegistrationV2LoadingStateProps {
  targetName: string
}

export const RegistrationV2LoadingState = ({
  targetName,
}: RegistrationV2LoadingStateProps) => {
  return (
    <section className="space-y-3 rounded border p-4">
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
        registration-v2
      </p>
      <h1 className="font-semibold text-2xl">{targetName}</h1>
      <p className="text-sm text-muted-foreground">
        Checking availability and loading initial quote.
      </p>
    </section>
  )
}
