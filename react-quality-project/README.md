# Northstar Customer & Order Dashboard

A responsive React and TypeScript workspace for reviewing customers, tracking orders, creating orders, and monitoring recent activity. It is a learning-focused project with production-minded boundaries and CI checks.

## Features

- Customer and order directories using a reusable typed table.
- Search, customer-based order filtering, and derived dashboard counts and completed revenue.
- Validated order form with accessible field errors, loading feedback, and success or provider failure states.
- Explicit loading, error, and ready states plus retry behavior.
- Zod runtime validation at the provider and form boundaries.
- Reducer-driven shared state and a typed, replaceable provider contract.

## Technology

React 19, TypeScript 6 (strict mode), Vite 8, Zod, Vitest, jsdom, React Testing Library, ESLint 10, and Prettier 3.

## Requirements and startup

Use Node.js 22 or newer and npm. From this directory run:

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. The current provider is **in-memory demo data**. Orders appear during the current page session and disappear after a reload; this project has no backend and makes no claim to persistent storage.

## Scripts

| Command                             | Purpose                                                   |
| ----------------------------------- | --------------------------------------------------------- |
| `npm run dev`                       | Start the Vite development server                         |
| `npm run typecheck`                 | Type-check application and test files                     |
| `npm run lint`                      | Run ESLint                                                |
| `npm run format:check`              | Verify Prettier formatting                                |
| `npm run format`                    | Format supported project files                            |
| `npm run test` / `npm run test:run` | Run Vitest once                                           |
| `npm run build`                     | Type-check project references and build production assets |
| `npm run ci`                        | Run typecheck, lint, format check, tests, and build       |
| `npm run preview`                   | Preview the production build                              |

## Architecture and state ownership

`src/domain/schemas.ts` defines runtime schemas and inferred domain types. `src/data/provider.ts` validates unknown values and provides the demo adapter behind `DashboardProvider`. `src/state/dashboardReducer.ts` owns shared load state, customer selection, and successful order insertion. `src/App.tsx` composes the view and calculates derived totals; temporary input and validation messages live in `OrderForm`. `DataTable<T>` renders both customers and orders with typed columns.

The data flow is: unknown source payload → Zod validation → typed provider result → reducer and React components → accessible UI. TypeScript checks program usage during development; Zod validates actual values at runtime.

## Checks and CI

Run `npm run ci` before submitting changes. GitHub Actions runs the same commands on pushes and pull requests using the lockfile and `npm ci`.

## Structure

```text
src/
  components/     reusable generic table and order form, with component tests
  data/           provider interface, demo adapter, and boundary tests
  domain/         Zod schemas, inferred types, and validation tests
  state/          typed dashboard reducer and transition tests
  test/           Vitest DOM setup
  App.tsx         dashboard composition and derived statistics
docs/             file reference and Arabic learning path
.github/workflows/ci.yml
```

## Adding a field

Add it to the Zod schema first. Inferred TypeScript types then update automatically. Update demo data (or the API response contract), relevant table columns or form controls, and tests. For a new order field, also decide whether it belongs in the creation-input schema; stored order properties such as ID and creation time are usually provider-generated.

## Future real API configuration

Replace the implementation in `src/data/provider.ts` with HTTP calls while preserving `DashboardProvider`. Check unsuccessful HTTP status, catch malformed JSON as `unknown`, and validate response bodies with the existing Zod schemas before returning them. Add authentication and environment-based API URL configuration only when the service contract exists. Do not treat TypeScript annotations as runtime validation.

## Limitations and future work

Implemented: dashboard, search, customer filter, customer directory, activity display, order creation, runtime validation, reducer state, tests, and quality workflow. Not implemented: persistent storage, real authentication, live API, server pagination, editing/deleting customers or orders, and authoritative trend comparisons. Trend percentages in demo cards are presentation samples, not calculated analytics.

## Learning documentation

- [File guide](docs/FILE_GUIDE.md)
- [Arabic learning path](docs/LEARNING_PATH.md)
