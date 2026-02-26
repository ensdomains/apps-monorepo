import { GraphQLClient } from 'graphql-request'

export const graphqlIndexerClient = new GraphQLClient(
  'https://graphql.ens.dev/',
)
