# Name Matching Algorithm Improvement Plan

## Current Implementation Summary

`findClosestMatch` in `utilities/charUtils.js` uses the `string-similarity` npm package, which implements **Sørensen–Dice coefficient** on character bigrams (pairs of adjacent characters).

**How it works:** Both strings are decomposed into all adjacent character pairs (bigrams). The score is `2 * |shared bigrams| / (|bigrams in A| + |bigrams in B|)`. A fixed `MIN_THRESHOLD` of `0.15` gates what counts as a plausible match.

---

## Known Weaknesses of the Current Approach

1. **Short names fail silently.** Names of 1–3 characters produce very few bigrams. A 2-character name has only one bigram, so comparisons are nearly binary and scores become unreliable.

2. **No input normalization.** The query is compared as-is against stored names. `"aria"` and `"Aria"` will not score 1.0 unless the casing happens to match. Diacritics, extra spaces, or punctuation similarly break matches.

3. **Anagram vulnerability.** Dice on bigrams scores anagrams very highly (e.g., `"Nael"` vs `"Lane"` share most of the same bigrams). This produces false confidence in an incorrect match.

4. **No phonetic awareness.** Names that sound identical but are spelled differently (`"Kayla"` / `"Kaila"`, `"Caitlin"` / `"Kaitlyn"`) score poorly despite being the user's clear intent.

5. **No prefix weighting.** People typically remember the start of a name more reliably than the end. Dice treats all positions equally, so a mismatch at the start of the name is weighted no differently than a mismatch in the middle.

6. **Token blindness for multi-word names.** `"Lord Valen"` vs `"Valen"` scores poorly even though one is clearly a title-prefixed form of the other. The algorithm has no concept of tokens or words within a name.

7. **Uniform threshold.** A single `MIN_THRESHOLD = 0.15` is applied regardless of query length, name length, or context. Very short queries match almost everything above this floor, while long queries may fail to clear it even with obvious partial matches.

8. **No ranking diversity.** The top-10 results list is scored and sorted, but there is no mechanism to surface a phonetically different but visually similar candidate alongside the best bigram match — the user only sees one dimension of similarity.

---

## Alternative Approaches

### Option A — Jaro-Winkler Distance (Drop-in Replacement)

**What it is:** Jaro-Winkler is a string metric specifically designed for short proper names (originally developed for census record linkage). It gives extra weight to matching prefixes and is more tolerant of transpositions than Dice.

**Formula sketch:**
- Jaro score considers the number of matching characters and transpositions within a sliding window.
- Winkler's modification boosts the score proportionally to the length of the common leading prefix (up to 4 characters).

**Strengths over current:**
- Handles transpositions well (`"Aleis"` → `"Alise"`).
- Prefix boost directly rewards the human tendency to remember name beginnings.
- More reliable for very short names (2–4 characters).
- More resistant to anagrams because position matters.

**Weaknesses:**
- Still no phonetic awareness.
- Multi-word names are still treated as a single token.
- Library: `jaro-winkler` or `natural` (Node.js).

**Effort:** Low — near drop-in swap for `string-similarity`.

---

### Option B — Levenshtein Edit Distance (Normalized)

**What it is:** Counts the minimum number of single-character edits (insertions, deletions, substitutions) required to transform one string into another. Normalized to `[0, 1]` as `1 - (editDistance / maxLength)`.

**Strengths over current:**
- Intuitive model of typos: each keystroke error costs exactly 1.
- Works well for moderate-length names with a handful of typos.

**Weaknesses:**
- Expensive: O(m×n) per comparison. With a large character cache this could be a bottleneck.
- Transpositions cost 2 edits (a deletion + insertion) unless you use **Damerau–Levenshtein**, which treats transpositions as 1 edit.
- No phonetic awareness.
- No prefix weighting.

**Recommendation:** Only consider this if switching to Damerau–Levenshtein (handles transpositions as 1 edit). Library: `natural` or `fastest-levenshtein`.

**Effort:** Low-to-medium.

---

### Option C — Phonetic Matching (Double Metaphone)

**What it is:** Phonetic algorithms reduce a name to a code based on how it sounds. **Double Metaphone** is the most robust of the family (Soundex, Metaphone, Double Metaphone) and handles non-English names and multiple pronunciations.

**Use case:** User types `"Kayla"`, stored name is `"Kaila"`. Bigram/edit-distance approaches produce a low score; Double Metaphone reduces both to the same phonetic code and scores them as identical.

**Strengths over current:**
- Excellent for the common case where users know how a name sounds but not how it is spelled.
- Handles foreign-origin names better than Soundex.

**Weaknesses:**
- Purely phonetic — two names that sound different but are spelled similarly (e.g., `"Trish"` vs `"Irish"`) are treated as unrelated.
- Not useful standalone: a phonetic code match is binary (same code = 1, different = 0). It must be combined with a character-level metric to produce a ranked list.
- Library: `natural` (includes Double Metaphone).

**Effort:** Medium standalone; best used as a component in a hybrid.

---

### Option D — Input Normalization Pipeline (Preprocessing Layer)

**What it is:** Before any algorithm runs, normalize both the query and the candidate names through a consistent transformation pipeline. This is not an algorithm replacement — it improves every algorithm above.

**Recommended normalization steps:**
1. Lowercase both strings.
2. Strip leading/trailing whitespace and collapse internal runs of whitespace.
3. Remove or normalize diacritics (e.g., `"Élara"` → `"Elara"`) using Unicode NFD decomposition.
4. Optionally: strip common title prefixes (`"the "`, `"lord "`, `"lady "`, `"sir "`) before comparison, then restore them in the result.
5. Optionally: strip punctuation (apostrophes in `"O'Brien"` → `"OBrien"`).

**Strengths:**
- Zero-cost improvement to any algorithm already in use.
- Eliminates the most common source of missed exact matches (case, accents).
- Handles cosmetic variation without requiring a fuzzy match at all.

**Weaknesses:**
- Stripping diacritics or punctuation can occasionally create false positives between distinct names.
- Title-word stripping requires a maintained list of known prefixes.

**Effort:** Very low.

---

### Option E — Token-Aware Matching

**What it is:** Split multi-word names into tokens and match each token independently, then aggregate scores. This reflects the real-world structure of names (given name + surname, title + name, etc.).

**Algorithm sketch:**
1. Tokenize both query and candidate (split on whitespace).
2. For each query token, find its best match across all candidate tokens using Jaro-Winkler (or whichever character-level metric is chosen).
3. Aggregate per-token scores (e.g., average, or weighted by token position).
4. Bonus: if every query token matches a candidate token above a sub-threshold, boost the overall score.

**Strengths over current:**
- `"Valen"` correctly matches `"Lord Valen"` at high confidence.
- A user who remembers only part of a compound name still gets a useful result.
- Works well with abbreviated first names or initials.

**Weaknesses:**
- More complex to implement and tune than a single-metric approach.
- Partial token matches can produce false positives for short common tokens.

**Effort:** Medium.

---

## Hybrid Approaches

### Hybrid 1 — Normalization + Jaro-Winkler (Recommended Minimal Improvement)

**Combines:** Option D (normalization) + Option A (Jaro-Winkler).

**Why:** This is the lowest-effort change that addresses the most impactful weaknesses: case-sensitivity failures, short-name unreliability, transpositions, and prefix recall. Jaro-Winkler was literally designed for this exact use case (personal name matching in record linkage).

**Implementation sketch:**
```
normalize(s) → lowercase, trim, strip diacritics
score = jaroWinkler(normalize(query), normalize(candidate))
```

**Addresses:** weaknesses 1, 2, 3, 5 from the list above.

---

### Hybrid 2 — Normalization + Jaro-Winkler + Phonetic Gating

**Combines:** Option D + Option A + Option C.

**How it works:**
1. Normalize both strings.
2. Compute Jaro-Winkler score.
3. If the Jaro-Winkler score falls in an ambiguous band (e.g., 0.5–0.75), compute Double Metaphone codes for both strings. If they share a phonetic code, apply a configurable score boost (e.g., +0.15).
4. Rank candidates by final composite score.

**Why the band approach:** Phonetic matching is most valuable when character-level similarity is ambiguous. Very high Jaro-Winkler scores don't need phonetic assistance; very low scores are genuinely different names and a phonetic boost would cause false positives.

**Addresses:** weaknesses 1, 2, 3, 4, 5.

---

### Hybrid 3 — Normalization + Token Matching + Jaro-Winkler Per Token

**Combines:** Option D + Option E + Option A.

**How it works:**
1. Normalize both strings.
2. Tokenize both.
3. For each query token, find its best Jaro-Winkler match across all candidate tokens.
4. Final score = weighted mean of per-token best matches (weight by token length to penalize trivially short tokens).
5. Bonus for full-token coverage (all query tokens matched a candidate token above 0.8).

**Why it improves multi-word names:** `"Lord Valen"` → tokens `["lord", "valen"]`. Query `"valen"` → token `["valen"]`. Token `"valen"` matches `"valen"` at 1.0. Score reflects that.

**Addresses:** weaknesses 1, 2, 3, 5, 6.

---

### Hybrid 4 — Full Composite Score (Most Robust)

**Combines:** Option D + Option A + Option C + Option E.

**Scoring formula:**
```
composite = (w1 * jaroWinkler) + (w2 * phoneticBoost) + (w3 * tokenCoverage)
```
Where weights are tuned empirically (suggested starting point: w1=0.6, w2=0.25, w3=0.15).

**When to use:** If the character database is large and name diversity is high (many phonetically similar names, many multi-word names, many foreign-origin names), this approach produces the most reliable ranking.

**Tradeoffs:** More complex to implement, test, and tune. Weights must be calibrated against real query/name data. The `nameMatchTest()` method already in the file provides a useful harness for this calibration.

**Addresses:** all 8 weaknesses listed above.

---

## Additional Recommendations (Independent of Algorithm Choice)

### Dynamic Threshold by Query Length
Replace the flat `MIN_THRESHOLD = 0.15` with a length-dependent floor:
- Query length ≤ 3 characters: require score ≥ 0.85 (very short queries are dangerous to match loosely).
- Query length 4–6 characters: require score ≥ 0.55.
- Query length ≥ 7 characters: require score ≥ 0.35.

This eliminates the false-positive flood from short queries while allowing longer queries more latitude.

### Cache Normalized Name List
Pre-compute normalized versions of all names in `RefreshCache()` and store them alongside the originals. This avoids re-normalizing the entire candidate list on every call to `findClosestMatch`.

### Calibrate Using `nameMatchTest()`
The existing `nameMatchTest()` method compares tupper log names against character names and flags near-misses. This is a natural regression/calibration harness. Before and after any algorithm change, run this test and compare the flagged mismatches to verify improvement.

---

## Summary Table

| Option | Effort | Typo Handling | Phonetic | Prefix Bias | Multi-word | Short Names |
|---|---|---|---|---|---|---|
| Current (Dice) | — | Fair | None | None | Poor | Poor |
| A: Jaro-Winkler | Low | Good | None | Yes | Poor | Good |
| B: Levenshtein | Low | Good | None | None | Poor | Fair |
| C: Phonetic only | Medium | None | Excellent | None | Poor | Poor |
| D: Normalization | Very Low | Partial | None | None | None | None |
| Hybrid 1 (D+A) | Low | Good | None | Yes | Poor | Good |
| Hybrid 2 (D+A+C) | Medium | Good | Good | Yes | Poor | Good |
| Hybrid 3 (D+E+A) | Medium | Good | None | Yes | Excellent | Good |
| Hybrid 4 (D+A+C+E) | High | Excellent | Good | Yes | Excellent | Good |

**Recommended path:** Start with **Hybrid 1** (normalization + Jaro-Winkler) as it requires the least effort for the most immediate improvement. If phonetic mismatches remain a common complaint, layer in **Hybrid 2**. If multi-word name partial-recall is a problem, move to **Hybrid 3** or **Hybrid 4**.
