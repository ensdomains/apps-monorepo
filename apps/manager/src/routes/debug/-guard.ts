import { notFound } from '@tanstack/react-router'
import { DEBUG_FEATURES_ENABLED } from '@/utils/debug-features'

export const debugRouteBeforeLoad = () => {
  if (!DEBUG_FEATURES_ENABLED) {
    throw notFound()
  }
}
