# Chess V2

V2 is a fresh TypeScript and pnpm monorepo. It is developed independently from the frozen `v1.0.0` release: V1 remains available as a reference for chess behavior, but its structure is not a constraint on V2.

## Workspace

- `apps/web` is the React and Vite browser application.
- `packages/chess-core` is the framework-independent chess domain package.
- Root scripts coordinate builds, tests, development, and type checking with pnpm.

## Development

Use Node.js 22 or newer and pnpm 11.25.0 (pinned through `packageManager`). Run `pnpm install`, then `pnpm dev` to start the web app. `pnpm build`, `pnpm typecheck`, and `pnpm test` validate the workspace.

## Saving a game

V2 automatically saves the current in-progress game in this browser and restores it on the next visit. A saved chess clock resumes paused; time spent with the app closed is not deducted. Existing V1 browser saves are left untouched and are not automatically imported into V2.
