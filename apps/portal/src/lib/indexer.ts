import { GraphQLClient } from 'graphql-request'

export const graphqlIndexerClient = new GraphQLClient(
  'https://tenderly-ensv2.pff.sh/',
)
