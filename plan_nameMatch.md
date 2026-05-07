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

module.exports = { findBestNameMatch, rankNameMatches, ACCEPT_THRESHOLD, CONFIDENT_THRESHOLD };
```

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
