export const RegistrationProgressBar = ({
  label,
  description,
  progress,
}: {
  label: string
  description?: string
  progress: number
}) => {
  return (
    <div className="mt-1 flex flex-col gap-1">
      <div className="relative min-h-14 sm:min-h-12">
        <div className="absolute inset-0 transition-all duration-300 ease-in-out">
          <p className="font-medium text-base text-ens-blue">{label}</p>
          {description && (
            <p className="text-ens-gray text-sm">{description}</p>
          )}
        </div>
      </div>

      <div className="relative h-2 w-full overflow-hidden rounded-full bg-ens-gray-two">
        <div
          className="absolute h-full rounded-l-full bg-ens-blue transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute inset-0 animate-shimmer bg-linear-to-r from-transparent via-white/20 to-transparent" />
        </div>
      </div>
    </div>
  )
}
