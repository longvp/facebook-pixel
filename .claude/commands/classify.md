---
description: Phase 4 — classify tasks into now/complex/discuss; output complex-cases & questions.
---
You are in the CLASSIFY phase for: $ARGUMENTS

Read `docs/flow/user-stories.md` and the plan. Classify every task into:
- **now** — well-understood, safe to implement immediately.
- **complex** — large or risky; needs decomposition or a spike.
- **discuss** — blocked on an open product/technical decision.

Write three outputs:
1. `docs/flow/classification.md` — a table: task | group | reason.
2. `docs/flow/complex-cases.md` — each complex task with why it's complex and a
   proposed breakdown/spike.
3. `docs/flow/questions.md` — each discuss item as a concrete question with options.

End by suggesting `/execute` for the `now` tasks.
