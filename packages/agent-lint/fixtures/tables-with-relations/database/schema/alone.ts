declare const pgTable: (name: string, columns: object) => unknown
declare const uuid: (name: string) => { references: (target: () => unknown) => unknown }
declare const users: { readonly id: unknown }
export const names = pgTable('names', { owner: uuid('owner').references(() => users.id) }) // expect: tables-with-relations
