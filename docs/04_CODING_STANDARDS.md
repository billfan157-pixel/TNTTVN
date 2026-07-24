# Coding Standards

> Conventions extracted from the existing codebase. These are descriptive, not aspirational.

## 1. TypeScript

- **No `any`** — use explicit types or `unknown`
- Prefer `interface` over `type` for objects
- Use `type` for unions, primitives, and tuples
- Barrel exports from `src/types/index.ts`
- Use `as const` for literal types
- No enums — use union types: `type Theme = 'light' | 'dark'`

## 2. React

- Functional components only — `const X: React.FC<Props> = () => { ... }`
- Named exports preferred over default exports
- Props typed inline or exported `interface Props { ... }`
- Use `useState`, `useEffect`, `useMemo`, `useCallback` from React 19
- No class components, no `React.FC` return type annotation (implicit JSX.Element)
- Event handlers: `const handleX = (e: React.ChangeEvent<HTMLInputElement>) => { ... }`

## 3. Zustand Stores

```ts
import { create } from 'zustand'

interface StoreState {
  items: Item[]
  loadItems: () => Promise<void>
}

export const useStore = create<StoreState>()((set) => ({
  items: [],
  loadItems: async () => { ... },
}))
```

- Store types co-located with store file (or in `src/types/`)
- Actions are functions on the store, not separate files
- Use `persist` middleware with `dexieStorage` for persistence

## 4. Hooks

- Custom hooks in `src/hooks/`
- Prefix: `use` camelCase
- Return typed objects, not tuples
- File name matches hook name: `useOnlineStatus.ts`
- Keep hooks focused — one concern per hook

## 5. API Layer (`src/lib/api.ts`)

- Fetch-based (no axios/ky)
- All functions accept typed params, return typed responses
- Error handling: throw on non-ok response
- Auth header: `Authorization: Bearer ${token}` from localStorage
- Base URL: `import.meta.env.VITE_API_URL || 'http://localhost:3001'`

## 6. Routing (TanStack Router)

- File: `src/router.tsx` — single file, all routes
- Route paths: lowercase, hyphenated for multi-word
- Lazy loading: `component: () => import('./pages/Dashboard')`
- Use `@tanstack/react-router-devtools` in dev

## 7. CSS / Tailwind

- Tailwind v4 CSS-first config: `@import "tailwindcss"` in `index.css`
- Custom tokens in `@theme {}` block
- No Tailwind config file — all config in CSS
- Dark mode via `.dark` class custom variant
- Global utility classes for components: `.btn`, `.card`, `.badge`
- Avoid inline `style={}` — prefer utility classes or CSS variables

## 8. Styling Hierarchy

1. Tailwind utility classes (first preference)
2. Global CSS classes from `index.css` (`.btn`, `.card`)
3. CSS variables (`var(--color-parish-primary)`)
4. Inline styles (last resort, rare)

## 9. File Organization

```
src/
  components/
    common/       # Shared components (used by both layouts)
    desktop/      # Desktop-specific layouts
    mobile/       # Mobile-specific layouts
    __tests__/    # Component tests
  pages/          # Route-level page components
  stores/         # Zustand stores
  hooks/          # Custom React hooks
  lib/            # Utilities, API client, DB, sync
  types/          # TypeScript type definitions
  utils/          # Pure utility functions
  data/           # Mock data
  __tests__/      # Integration/unit tests
```

## 10. Imports Order

1. React / framework
2. Third-party libraries
3. Internal modules (from `src/`)
4. Types
5. CSS (only in entry point)
- No blank line groups enforced — keep consistent with surrounding files

## 11. Naming Conventions

| Concept | Convention | Example |
|---------|-----------|---------|
| Components | PascalCase | `StudentModal.tsx` |
| Hooks | camelCase with `use` | `useSyncEngine` |
| Stores | camelCase with `use` + `Store` | `useStudentStore` |
| Utils | camelCase | `calculateAverage` |
| Types/Interfaces | PascalCase | `GradeRecord` |
| Files (components) | PascalCase | `DesktopSidebar.tsx` |
| Files (non-component) | camelCase | `syncProcessor.ts` |
| CSS classes | kebab-case | `btn-primary`, `form-input-sm` |
| CSS variables | kebab-case with `--color-` prefix | `--color-parish-primary` |

## 12. State Management Rules

- **Server state** → Zustand store with sync queue
- **UI state** → Zustand store (filterStore, uiStore)
- **Theme** → Zustand store with Dexie persistence
- **Sync queue** → Dexie IndexedDB (syncStore)
- **URL state** → TanStack Router search params
- **Form state** → Local `useState` (not stored globally)
- No React Query / TanStack Query

## 13. Error Handling

- Backend: try/catch → `c.json({ error: message }, statusCode)`
- Frontend API: check `response.ok`, throw descriptive error
- React: `ErrorBoundary` component wraps app
- Sentry: `@sentry/react` for error tracking
- No global error handler middleware on backend

## 14. Testing Conventions

- Vitest for unit/integration
- `fake-indexeddb` for Dexie mock
- Test files: `*.test.ts` or `*.test.tsx` in `__tests__/` or co-located
- Playwright for E2E in `e2e/`
- No coverage config yet
