# Chess V2

V2 is a fresh TypeScript and pnpm monorepo. It is developed independently from the frozen `v1.0.0` release: V1 remains available as a reference for chess behavior, but its structure is not a constraint on V2.

## Workspace

- `apps/web` is the React and Vite browser application.
- `packages/chess-core` is the framework-independent chess domain package.
- Root scripts coordinate builds, tests, development, and type checking with pnpm.

## Development

Use Node.js 22 or newer and pnpm 11.25.0 (pinned through `packageManager`). Run `pnpm install`, then `pnpm dev` to start the web app. `pnpm build`, `pnpm typecheck`, and `pnpm test` validate the workspace.

## Migration policy

Port V1 behavior in small, independently tested slices. Re-express domain logic in `packages/chess-core` where appropriate; do not transplant V1's DOM-driven architecture. Keep migration decisions and compatibility requirements explicit in each change.

The migration-only modernization stages, V1 behavior inventory, and current progress are tracked in [the V2 migration plan](docs/v2-migration-plan.md). This is separate from the product feature roadmap.
