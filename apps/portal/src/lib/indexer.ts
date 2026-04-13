import { GraphQLClient } from 'graphql-request'

export const graphqlIndexerClient = new GraphQLClient(
  'https://staging-graphql.ens.dev/',
)
