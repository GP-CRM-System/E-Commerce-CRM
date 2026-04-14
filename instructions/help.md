
**The single biggest structural problem** is that most tests only assert HTTP status codes, not response body values. A test that checks `response.status === 200` and `response.body.data.distribution` exists is only proving the route didn't crash — it's not proving the logic is correct. The analytics and lifecycle tests are the worst offenders here.

**Second biggest**: the shared mutable state pattern (`testCustomerId`, `testNoteId`, etc. as outer `let` vars). When the "create customer" test fails, every downstream test silently produces a wrong result instead of a clear failure. The silent `if (!id) return` guards in the roles tests are the same problem — a test that exits early always shows as green.

**Third**: copy-pasted setup. All four files have the identical 40-line `signUp → createOrg → setActiveOrg → signIn` block. Extracting that into `test/helpers/auth.ts` would cut setup code by ~150 lines and make future test files much easier to write correctly.

The **Infrastructure** tab in the widget covers teardown gaps and shared helper suggestions. The **Overview** tab has the top 6 items ranked by severity if you want a quick fix list.

