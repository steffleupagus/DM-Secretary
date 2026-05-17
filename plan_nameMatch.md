# Plan: Reusable Name Matching Utility

## Objective

Create a single reusable function `findBestNameMatch(input, nameList)` that, given an author
name (user name or tupper name) and an array of candidate name strings, returns the best
reasonable match object or `null` if no candidate clears the confidence threshold.

The function must go beyond pure string-similarity (Dice / Levenshtein) to reduce both
false negatives (missed matches) and false positives (wrong matches). It does this by
combining several independent signals into a weighted composite score, then applying a
calibrated threshold gate.

---

## Location

`utilities/nameMatchUtils.js`  
Consumed by `charUtils.js`, `admincmd_ParseProfiles.js`, and anywhere else name matching
is currently duplicated.

---

## Algorithm Overview

```
input ──► normalise ──► per-candidate scoring pipeline ──► aggregate score ──► threshold gate ──► result
```

Each candidate in `nameList` receives a composite score in [0, 1].  
The candidate with the highest composite score is returned if it clears `MIN_ACCEPT`.  
If no candidate clears the threshold, the function returns `null`.

---

## Step 1 — Normalisation

Apply the same transforms to both the input and every candidate before any comparison.
Normalisation is non-destructive: the original strings are preserved for output.

| Transform | Reason |
|---|---|
| Lowercase | Case-insensitive comparison |
| Strip parentheticals `(…)` | e.g. "Aria (Retired)" → "Aria" |
| Strip common honorifics / filler words | "the", "a", "of", "sir", "lady" |
| Collapse whitespace / trim | Prevents off-by-one token splits |
| Strip punctuation except hyphens | Hyphens are meaningful in compound names |

Produce two forms per string:
- `full` — fully normalised string
- `tokens` — array of individual words from `full`

---

## Step 2 — Scoring Pipeline (per candidate)

Run every signal independently and combine at the end.  
Each signal returns a score in [0, 1].

### Signal A — Exact Match
Score: `1.0` if `full(input) === full(candidate)`, else `0`.  
Short-circuit: if score is 1.0, skip all other signals and return immediately.

### Signal B — Substring Containment
Check both directions:
- Does the normalised input contain the normalised candidate?
- Does the normalised candidate contain the normalised input?

Score:
```
containsScore = longerContainsShorter ? (shorter.length / longer.length) : 0
```
Rewards cases where one name is a strict prefix, suffix, or embedded substring of the
other (e.g. "Aria" vs "Aria Silverwind").

### Signal C — Token Overlap (Jaccard-style)
Split both names into tokens.  
```
overlap     = intersection(tokens_input, tokens_candidate)
union       = union(tokens_input, tokens_candidate)
tokenScore  = overlap.size / union.size
```
Handles multi-word names that share most but not all words regardless of order
(e.g. "Silverwind Aria" vs "Aria Silverwind").

### Signal D — Token Set Ratio
Sort both token arrays alphabetically, rejoin into strings, then run Dice coefficient
(via `string-similarity`) on the rejoined strings.  
Catches word-order transpositions that trip up character-level similarity.

### Signal E — Character-Level Fuzzy Similarity
Run `string-similarity.compareTwoStrings(full_input, full_candidate)` (Dice bigram).  
Standard baseline that the existing code already uses.

### Signal F — Initialism / Abbreviation Match
If the input is 2–5 characters long, check whether it matches the initials of the
candidate's tokens (e.g. "AS" matches "Aria Silverwind").  
Score: `1.0` if initials match exactly, `0.5` if initials are a prefix of the input or
vice versa, else `0`.  
If the input is longer, skip this signal (weight = 0).

### Signal G — Longest Common Subsequence Ratio (optional, lightweight)
```
lcsRatio = LCS(full_input, full_candidate).length / max(len_input, len_candidate)
```
Pure-JS implementation (~15 lines). Captures shared character runs that Dice misses for
short strings.

---

## Step 3 — Composite Score

Weighted average of the signals above.  
Weights are tunable constants exported alongside the function.

| Signal | Default Weight | Notes |
|---|---|---|
| A — Exact | 1.0 (short-circuit, not averaged) | — |
| B — Substring Containment | 0.30 | High value; substring is a strong signal |
| C — Token Overlap | 0.25 | Multi-word names |
| D — Token Set Ratio | 0.20 | Word-order insensitivity |
| E — Dice Bigram | 0.15 | General fuzzy baseline |
| F — Initialism | 0.05 | Narrow applicability |
| G — LCS Ratio | 0.05 | Tie-breaker for short names |

```
composite = (wB*B + wC*C + wD*D + wE*E + wF*F + wG*G) / (wB+wC+wD+wE+wF+wG)
```

Signals that are not applicable (e.g. initialism on a long input) contribute `0` and
their weight is removed from the denominator so they don't unfairly suppress the score.

---

## Step 4 — Threshold Gate

Two configurable thresholds:

| Constant | Default | Meaning |
|---|---|---|
| `ACCEPT_THRESHOLD` | `0.50` | Composite score required to return a match |
| `CONFIDENT_THRESHOLD` | `0.85` | Score above which the match is flagged `confident: true` |

If the best candidate's composite score is below `ACCEPT_THRESHOLD`, return `null`.

---

## Return Value

```js
// Match found
{
  match: "Aria Silverwind",   // original (un-normalised) string from nameList
  score: 0.87,               // composite score [0,1]
  confident: true,           // score >= CONFIDENT_THRESHOLD
  signals: {                 // individual signal scores for debugging / logging
    substring: 0.80,
    tokenOverlap: 1.00,
    tokenSetRatio: 0.94,
    dice: 0.75,
    initialism: 0,
    lcs: 0.83
  }
}

// No match
null
```

---

## Public API

```js
/**
 * Find the best matching name from a list.
 *
 * @param {string}   input    - The name to search for (author / tupper name).
 * @param {string[]} nameList - Array of candidate names to match against.
 * @param {object}   [opts]   - Optional overrides.
 * @param {number}   [opts.acceptThreshold]    - Override ACCEPT_THRESHOLD.
 * @param {number}   [opts.confidentThreshold] - Override CONFIDENT_THRESHOLD.
 * @param {object}   [opts.weights]            - Override individual signal weights.
 * @returns {{ match: string, score: number, confident: boolean, signals: object } | null}
 */
function findBestNameMatch(input, nameList, opts = {}) { … }

/**
 * Score all candidates and return them sorted by composite score (descending).
 * Useful for disambiguation UIs or debug embeds.
 *
 * @returns Array<{ match: string, score: number, confident: boolean, signals: object }>
 */
function rankNameMatches(input, nameList, opts = {}) { … }

/**
 * Find the best one-to-one pairing between two lists of names.
 * See "List Pair Matching" section below for full algorithm details.
 *
 * @param {string[]} listA  - First list of names (e.g. sheet names).
 * @param {string[]} listB  - Second list of names (e.g. profile names).
 * @param {object}   [opts] - Optional overrides (same shape as findBestNameMatch opts).
 * @returns {{
 *   pairs:      Array<{ a: string, b: string, score: number, confident: boolean }>,
 *   unmatchedA: string[],
 *   unmatchedB: string[],
 *   conflicts:  Array<{ winner: string, loser: string, contested: string, scores: object }>
 * }}
 */
function pairNameLists(listA, listB, opts = {}) { … }

module.exports = {
  findBestNameMatch,
  rankNameMatches,
  pairNameLists,
  ACCEPT_THRESHOLD,
  CONFIDENT_THRESHOLD
};
```

---

## List Pair Matching

`pairNameLists(listA, listB)` solves the problem of finding the best **one-to-one**
assignment between two sets of names — for example, matching a user's sheet records
against their profile records, or mapping tupper names to character names across the
whole server.

The naive approach of calling `findBestNameMatch` once per entry in A fails here: two
entries in A can independently claim the same entry in B as their best match, producing
duplicated pairings and leaving other entries unmatched. The algorithm below prevents
this using a score matrix and a greedy conflict-resolution pass.

---

### Phase 1 — Build the Score Matrix

Score every (A, B) pair using the same composite scoring pipeline defined in Steps 1–3.
This produces an `|A| × |B|` matrix where `matrix[i][j]` is the composite score for
pairing `listA[i]` with `listB[j]`.

```
          B0      B1      B2      B3
A0      0.91    0.12    0.08    0.03
A1      0.10    0.87    0.55    0.04
A2      0.06    0.61    0.89    0.07
A3      0.04    0.08    0.11    0.72
```

Because the scoring pipeline already normalises strings and is commutative in its signals,
the matrix is computed once and reused in both directions.

**Complexity:** `O(|A| × |B|)` scoring calls. For typical list sizes in this codebase
(< 100 names per user) this is negligible.

---

### Phase 2 — Greedy Assignment with Conflict Resolution

Sort all `|A| × |B|` candidate pairs by composite score descending into a flat list.
Walk the list in order, greedily claiming each pair if and only if neither participant
has already been assigned:

```
for each (i, j, score) in sortedPairs:
    if score < ACCEPT_THRESHOLD  →  stop (remaining pairs are all worse)
    if assignedA[i] or assignedB[j]  →  skip (conflict)
    record pair (listA[i], listB[j], score)
    mark assignedA[i] = true, assignedB[j] = true
```

This guarantees:
- Every name appears in at most one pair.
- The highest-scoring eligible pair is always claimed first.
- No pair below `ACCEPT_THRESHOLD` is ever accepted.

**Why greedy and not the Hungarian algorithm?**  
The Hungarian algorithm finds the globally optimal assignment but is O(n³) and complex
to implement correctly in pure JS. For the list sizes in this codebase the greedy result
is identical in the vast majority of cases. If two names in A are nearly identical and
both want the same B entry, the conflict log (Phase 3) surfaces this for manual review
rather than silently forcing a suboptimal assignment.

---

### Phase 3 — Conflict Log

A conflict occurs when a lower-scoring A entry wanted the same B entry that a
higher-scoring A entry already claimed. Each conflict is recorded as:

```js
{
  winner:    "Aria Silverwind",   // the A entry that was assigned
  loser:     "Aria",             // the A entry that lost the contest
  contested: "Aria Silverwind",  // the B entry both wanted
  scores: {
    winner: 0.91,
    loser:  0.74
  }
}
```

Conflicts are included in the return value and can be surfaced in debug embeds with a
`⚠️` flag, replacing the current ad-hoc `multiMatch` tracking in `generateRecordEmbed`.

---

### Phase 4 — Unmatched Collection

After the assignment pass, any entry in A or B that was never assigned is collected into
`unmatchedA` / `unmatchedB`. These replace the existing `❌` / `⚠️` icon logic in
`generateMatches` with a structured, inspectable output.

---

### Return Value

```js
{
  pairs: [
    { a: "Aria Silverwind", b: "Aria Silverwind", score: 0.91, confident: true },
    { a: "Brynn",           b: "Brynn Ashveil",   score: 0.78, confident: false },
  ],
  unmatchedA: ["OldChar (Retired)"],   // A entries with no acceptable B match
  unmatchedB: ["Ghost Profile"],       // B entries no A entry claimed
  conflicts: [
    {
      winner: "Aria Silverwind",
      loser:  "Aria",
      contested: "Aria Silverwind",
      scores: { winner: 0.91, loser: 0.74 }
    }
  ]
}
```

---

### Optimisation: Pre-filter with a Fast Pass

Before building the full score matrix, run a fast substring pre-filter to skip obviously
zero-score pairs and avoid running the full pipeline on every combination:

```
for each (A_i, B_j):
    if no token in A_i appears anywhere in B_j AND
       no token in B_j appears anywhere in A_i AND
       Dice(A_i, B_j) < 0.1:
         matrix[i][j] = 0  (skip full pipeline)
```

This reduces the number of full pipeline calls dramatically when lists are large and
most cross-pairs are unrelated.

---

### Use in `admincmd_ParseProfiles.js`

`pairNameLists` directly replaces the dual calls to `generateRecordEmbed` (once for
sheets→profiles and once for profiles→sheets). A single `pairNameLists(sheetNames,
profileNames)` call returns the complete picture:

- `pairs` → rendered as `✅` with score percentage
- `conflicts` → rendered as `⚠️ multiple matches` 
- `unmatchedA` (unmatched sheets) → rendered as `❌ insufficient match`
- `unmatchedB` (unmatched profiles) → rendered as `⚠️ no sheet match`

---

## Migration Plan

1. Implement `nameMatchUtils.js` with full test coverage via `testcmd_TestNames.js`.
2. Replace the `StrComp.findBestMatch` call in `generateMatches()` (`admincmd_ParseProfiles.js`)
   with `rankNameMatches()`, mapping `score` to the existing `rating` field.
3. Replace the `StringSimilarity.findBestMatch` call in `charUtils.findClosestMatch()` with
   `findBestNameMatch()`, preserving the existing return shape.
4. Remove the direct `string-similarity` imports from both files (keep the package available
   since `nameMatchUtils` will use it internally for Signal E / D).
5. Delete the inline false-negative partial-match loop in `generateMatches()` — Signal B and C
   handle this more accurately.

---

## Edge Cases to Handle

- `input` or `nameList` is null / empty → return `null` immediately.
- `nameList` has one entry → still run pipeline; don't auto-return it.
- Very short inputs (1–2 chars) → initialism signal weighted up; Dice weighted down.
- Names with numbers (e.g. "Unit 7") → preserved through normalisation.
- Names entirely in capitals → lowercased before comparison.
- Duplicate entries in `nameList` → deduplicate before scoring.

---

## Dependencies

- `string-similarity` (already installed) — used for Signal D and E.
- No new packages required. LCS is implemented inline.
