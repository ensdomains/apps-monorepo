import { GraphQLClient } from 'graphql-request'

export const graphqlIndexerClient = new GraphQLClient(
  'https://ensv2.pff.sh/graphql',
)
