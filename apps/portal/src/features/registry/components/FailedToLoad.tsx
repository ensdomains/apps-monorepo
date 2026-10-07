import { TriangleAlert } from 'lucide-react'

export const FailedToLoad = () => (
  <span className="inline-flex items-center gap-1 text-destructive">
    <TriangleAlert className="size-3.5" />
    Failed to load
  </span>
)
