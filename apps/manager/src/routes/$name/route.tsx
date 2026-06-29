import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$name')({
  params: {
    // Returning `false` (instead of throwing) tells the router to skip this
    // route during matching when the value isn't a plausible ENS name.
    parse: ({ name }): { name: string } | false => {
      if (name.length < 3 || !name.includes('.')) {
        return false
      }

      return {
        name,
      }
    },
    // Prioritize address over names since addresses are more strict.
    priority: 50,
  },
})
