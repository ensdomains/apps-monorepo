interface RegistrationV2SuccessStateProps {
  targetName: string
}

export const RegistrationV2SuccessState = ({
  targetName,
}: RegistrationV2SuccessStateProps) => {
  return (
    <section className="space-y-3 rounded border p-4">
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
        success
      </p>
      <h1 className="font-semibold text-2xl">{targetName}</h1>
      <p className="text-sm text-muted-foreground">
        Registration completed. Final success actions will be wired in a later
        phase.
      </p>
    </section>
  )
}
