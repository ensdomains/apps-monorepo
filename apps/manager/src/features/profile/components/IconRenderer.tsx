interface IconRendererProps {
  icon: React.FC<{ className?: string }> | string | undefined
  className: string
}

export const IconRenderer = ({ icon: Icon, className }: IconRendererProps) => {
  if (!Icon) return null

  if (typeof Icon === 'string') {
    return <img alt="icon" className={className} src={Icon} />
  }

  return <Icon className={className} />
}
