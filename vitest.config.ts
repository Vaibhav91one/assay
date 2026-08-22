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
  },
});
