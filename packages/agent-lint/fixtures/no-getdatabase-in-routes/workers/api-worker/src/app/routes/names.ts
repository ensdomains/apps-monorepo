declare const getDatabase: () => unknown
export const handler = () => getDatabase() // expect: no-getdatabase-in-routes
