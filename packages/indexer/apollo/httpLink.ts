import { HttpLink } from '@apollo/client'

const httpLink = new HttpLink({
  fetch,
  fetchOptions: 'no-cors',
  uri: 'https://ensv2.pff.sh/graphql',
})

export default httpLink
