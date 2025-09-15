# ENS Apps Monorepo - Development Guidelines

## TanStack Query Best Practices

This project uses TanStack Query with a custom `resultQueryOptions` wrapper that integrates with `neverthrow` for error handling. **ALWAYS** follow these patterns when working with queries:

### Query Function Patterns

#### ✅ CORRECT: Destructure queryKey in queryFn
```typescript
export const getMyDataQueryOptions = (param1: string, param2: number) =>
  resultQueryOptions({
    queryKey: ['myData', { param1, param2 }] as const,
    queryFn: ({ queryKey: [, params] }) => {
      // Type cast params for type safety
      const { param1, param2 } = params as { param1: string; param2: number }
      return fetchMyData({ param1, param2 })
    },
  })
```

#### ❌ INCORRECT: Using closure variables directly
```typescript
// DON'T DO THIS - violates TanStack Query best practices
export const getMyDataQueryOptions = (param1: string, param2: number) =>
  resultQueryOptions({
    queryKey: ['myData', { param1, param2 }] as const,
    queryFn: () => fetchMyData({ param1, param2 }), // Wrong!
  })
```

### Query Key Patterns

1. **Use tuple format**: `[feature, params]` where:
   - First element is a string identifier for the query type
   - Second element is an object containing all parameters

2. **Always use `as const`** for better TypeScript inference:
   ```typescript
   queryKey: ['profile', { name }] as const
   ```

3. **Create factory functions** for complex query keys:
   ```typescript
   const profileQueryKey = ({ name }: { name: string }) =>
     ['profile', { name }] as const
   ```

### File Organization

- **Services**: Place query options in service files (`*.service.ts`)
- **Hooks**: Create custom hooks that use the query options
- **Consistent naming**:
  - Query options: `get[Feature]QueryOptions`
  - Query keys: `[feature]QueryKey`
  - Service functions: Should return `Result` or `ResultAsync` from neverthrow

### Example Patterns in This Codebase

Reference these files for correct patterns:
- `/src/features/searchName/services/searchNameService.ts`
- `/src/features/profile/hooks/useProfile.ts`
- `/src/features/profile/hooks/useEnsOwner.ts`
- `/src/hooks/useSupportsInterfaces.ts`

### Testing Queries

When testing components that use queries:
1. Mock the entire query options function
2. Ensure proper error states are tested using neverthrow's Result type
3. Test loading states appropriately

## Other Project Conventions

### Error Handling
- Use `neverthrow` Result types for all async operations
- Create specific error classes extending `TaggedError`
- Always handle both success and error cases explicitly

### TypeScript
- Strict mode is enabled
- Avoid `any` types
- Use proper type inference where possible
- Type cast only when necessary with clear intent

### Code Style
- Follow existing patterns in neighboring files
- Use the project's established utilities and helpers
- Check imports from existing files before adding new dependencies