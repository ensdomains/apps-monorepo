import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$name')({
  params: {
    // `false` passes the path on to the next candidate route.
    parse: ({ name }) =>
      name.length < 3 || !name.includes('.') ? false : { name },
    // Prioritize address over names since addresses are more strict.
    priority: 50,
  },
})
