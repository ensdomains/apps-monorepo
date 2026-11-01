declare const pgTable: (name: string, columns: object) => unknown
export const sessions = pgTable('sessions', {})
