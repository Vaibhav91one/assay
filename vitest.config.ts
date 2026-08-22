import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Feature branches are developed in git worktrees under `.claude/worktrees/`,
    // which is inside the repo. Vitest globs the filesystem and does not consult
    // .gitignore, so without this it collects every sibling branch's tests as
    // well as this one's -- 611 tests instead of 40, most of them failing because
    // they are pointed at a different database. Excluding it keeps the suite a
    // measurement of this working tree.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '.claude/**'],

    // Vitest's 5s default was chosen against a one-feature tree. On the merged
    // tree, the first test to touch the whole module graph pays a cold tsx
    // transpile of it -- every module in `tools/cli/` and `src/mcp/tools/`, and
    // everything the nine features pull in behind them. Measured: `assay --help`
    // spawns at 5.6-6.4s, and the first `loadTools()` call is the same shape.
    //
    // It moved between runs, which made it look like flakiness and is not: the
    // work is real and the bound was stale. Set here rather than per describe,
    // because it is a property of the tree and the next test to reach the whole
    // graph would meet it too.
    //
    // The 6s itself is genuine debt. `assay --help` transpiling forty modules to
    // print a menu is worth fixing in the binary, by whoever owns it -- this
    // stops the suite reporting it as a test failure, which is not what it is.
    testTimeout: 30_000,
    // The fingerprint artifact test rebuilds dist/fingerprint.js in beforeAll
    // and hit the 10s hook default the same way.
    hookTimeout: 30_000,
  },
});
