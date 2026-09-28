/** Keep an explicitly proposed notification email in the native review form. */
export const getNotificationEmailDefaults = (proposedEmail?: string) => ({
  email: proposedEmail?.trim() ?? '',
})
