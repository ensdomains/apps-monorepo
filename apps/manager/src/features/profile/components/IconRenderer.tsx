export const IconRenderer = ({
  icon: Icon,
  className,
}: {
  icon: React.FC<{ className?: string }> | string | undefined
  className: string
}) => {
  if (!Icon) return null

  if (typeof Icon === 'string') {
    return <img src={Icon} alt="icon" className={className} />
  }
  return <Icon className={className} />
}
