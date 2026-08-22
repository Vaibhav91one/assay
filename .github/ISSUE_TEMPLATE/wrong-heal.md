---
name: Wrong heal or bad abstention
about: Assay published a value it should not have, or held one it should have published
title: 'wrong heal: '
labels: correctness
---

This is the failure mode the project exists to prevent, so it is the most
valuable report you can file.

## The proof id

From the published row's `_assay` block. Everything else can be reconstructed
from it, so this is the one field that really matters.

```
proof_id:
```

`npm run explain <proof_id>` (or the `assay_explain` MCP tool) prints the
record — paste it if you can.

## What happened

| | |
|---|---|
| Field | |
| What was published | |
| What it should have said | |
| Run id | |

**Which is it?**

- [ ] **Wrong heal** — a value was published and it is incorrect
- [ ] **Bad abstention** — the cell was held, but the right answer was available

## The page

If the page is public, its URL. If not, anything you can share about the change —
the element moved, the class was renamed, a near-identical decoy appeared nearby.
The frozen capture is stored by digest, so `capture_sha256` from the proof record
is enough for us to reproduce it exactly.

## Anything else

Was this field healed before? Did it flip back and forth? Repeated healing on one
field is a different bug (an oscillating source) and is worth saying.
