import { i18n, type MessageDescriptor } from '@lingui/core'

/**
 * Translate with a pre-activation fallback: toasts can fire from effects that
 * run before a locale catalog has been activated, where `i18n._` would render
 * the message id instead of readable text.
 */
export const translateMessage = (message: MessageDescriptor): string =>
  i18n.locale ? i18n._(message) : (message.message ?? message.id)
