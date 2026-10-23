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
