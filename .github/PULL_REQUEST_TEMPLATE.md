## What this changes, and why

## Invariants

CI asserts all of these but the vitest line, which it runs and requires green
without checking a count. Run them locally first — it is faster than a red build.

```
npm test          →   (expect: 34 assertions, all checks pass)
npm run bench     →   (expect: 153 cases, gated arm 0.0% wrong)
npm run replay    →   (expect: 74 runs, 8 ok, 66 heals, 0 abstentions)
npx vitest run    →   (expect: green; set ASSAY_REQUIRE_DB=1 with Postgres up)
git diff results/events.jsonl   →   (expect: empty)
```

- [ ] All unchanged
- [ ] Something moved — the numbers before and after are in the description, and
      the change explains why the move is correct

## If this touches detection or healing

- [ ] Benchmark evidence included. An argument is not evidence here.

## Checklist

- [ ] `src/fingerprint.ts` still imports nothing
- [ ] The CLIs still run
- [ ] Commits are `type(scope): sentence`, each revertable alone
