import { ApolloClient, from, InMemoryCache } from '@apollo/client'
import httpLink from './httpLink'
import retryLink from './retryLink'

export const createApolloClient = () =>
  new ApolloClient({
    cache: new InMemoryCache(),
    devtools: {
      enabled: true,
    },
    link: from([retryLink, httpLink]),
  })

const apolloClient = createApolloClient()

export default apolloClient
