export type RecordIssue = {
  sectionKey: string
  fieldKey: string
  message: string
}

export class RecordsValidationError extends Error {
  issues: RecordIssue[]

  constructor(issues: RecordIssue[]) {
    super(issues.map((issue) => issue.message).join('\n'))
    this.name = 'RecordsValidationError'
    this.issues = issues
  }
}

export const getSaveRecordsErrorMessage = (error: unknown) => {
  if (!error || error instanceof RecordsValidationError) {
    return undefined
  }

  return error instanceof Error ? error.message : String(error)
}
