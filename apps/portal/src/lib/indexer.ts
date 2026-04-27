import { GraphQLClient } from 'graphql-request'

function getIndexerUrl(): string {
  try {
    if (typeof window !== 'undefined') {
      const envUrl = import.meta.env?.VITE_INDEXER_GRAPHQL_URL
      if (envUrl) return envUrl
    }
  } catch {
    // SSR or non-Vite environment
  }
  return 'https://staging-graphql.ens.dev/'
}

export const INDEXER_GRAPHQL_URL = getIndexerUrl()

export const graphqlIndexerClient = new GraphQLClient(INDEXER_GRAPHQL_URL)
