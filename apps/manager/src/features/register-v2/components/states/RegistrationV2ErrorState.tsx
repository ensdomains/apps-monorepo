interface RegistrationV2ErrorStateProps {
  targetName: string
  message: string
}

export const RegistrationV2ErrorState = ({
  targetName,
  message,
}: RegistrationV2ErrorStateProps) => {
  return (
    <section className="space-y-3 rounded border p-4">
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
        error
      </p>
      <h1 className="font-semibold text-2xl">{targetName}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
    </section>
  )
}
