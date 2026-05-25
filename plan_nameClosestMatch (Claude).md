# `findClosestMatch` — Analysis & Improvement Plan

**Source file:** `utilities/charUtils.js`
**Branch:** `_dev_approval-main`
**Repo:** `steffleupagus/DM-Secretary`

---

## Current Implementation Summary

The existing `findClosestMatch` method uses the `string-similarity` npm package, which implements the **Sørensen–Dice coefficient** on character bigrams. The core flow is:

1. Build a flat list of candidate names from `charCache` (optionally filtered by user).
2. Inject any provided NPCs into the candidate list.
3. Short-circuit on exact match.
4. Call `StringSimilarity.findBestMatch(char, names)` to score all candidates.
5. Filter results against `MIN_THRESHOLD = 0.15` and return the top 10 sorted by score.

---

## Current Weaknesses

### 1. Algorithm — no weight for word boundaries or prefixes
Dice coefficient treats all bigrams as equally significant. There is no boost for prefix matches or word-boundary alignment. A player typing `"Sam"` for `"Samuel"` scores poorly despite being the obvious intended match.

### 2. No input normalization
The query and candidate names are compared raw. Case differences, punctuation, diacritics, and extra whitespace all silently degrade scores. `"sir elyan"` vs `"Sir Elyan"` will not return a score of 1.0.

### 3. Flat threshold regardless of query length
`MIN_THRESHOLD = 0.15` applies equally to a 3-character query and a 20-character query. Short names need a relatively higher threshold to avoid false positives; long queries can tolerate more fuzz.

### 4. No token-level understanding
Multi-word names are compared as single strings. A player typing `"Ashford"` for `"Lady Ashford"` scores low even though the match is an exact token hit. Title words like Sir, Lady, and Lord pollute the comparison.

### 5. No phonetic matching
Character-based metrics are blind to homophones and near-homophones. Names like `"Caelan"` / `"Kaylan"` or `"Rhys"` / `"Reece"` will score poorly against each other despite being phonetically identical.

### 6. Performance — linear scan on every call
Every call to `findClosestMatch` runs a full O(n) comparison across the entire `charCache`. With a large cache (many characters across many users), this becomes expensive per-message, particularly since the bot handles concurrent users.

---

## Approaches

Each approach below is labelled by category:
- **Drop-in swap** — minimal code change, same structure
- **Alternative** — meaningful change to the scoring strategy
- **Hybrid** — combines multiple signals or stages

---

### Drop-in swap: Jaro-Winkler distance

**Best for:** Short names, prefix-typed queries

Replace `string-similarity` with a library providing Jaro-Winkler (e.g. the `natural` npm package). Jaro-Winkler applies a prefix bonus — if the first few characters match, the score is boosted. This directly models how players type character names: they start from the beginning.

**Strengths:**
- Prefix bias matches natural player typing patterns
- Handles character transpositions well (e.g. `"Aldric"` → `"Alrdc"`)
- Still a per-pair O(n·m) comparison — no new infrastructure needed
- `natural` provides a clean drop-in API

**Weaknesses:**
- Less useful for suffix or infix matches
- Does not understand word boundaries in multi-word names
- The same normalization gaps remain unless addressed separately

---

### Alternative: Levenshtein / Optimal String Alignment

**Best for:** Typo-tolerant matching

Edit distance counts the minimum single-character edits (insert, delete, substitute, optionally transpose) to transform one string into another. Normalize to a 0–1 score with `1 - (distance / max(len_a, len_b))`.

This directly models the most common player error: mistyping a letter, swapping two adjacent letters, or dropping a character entirely.

**Strengths:**
- Directly models typo patterns
- Handles deletions well (e.g. `"Thornwood"` → `"Thornwd"`)
- Widely available, well-understood, available in `natural`

**Weaknesses:**
- Slow on long strings O(n·m)
- Sensitive to length difference — `"Ali"` vs `"Alibek"` scores poorly under naive normalization
- Short queries against long names require asymmetric normalization to behave intuitively

---

### Alternative: Token-based matching

**Best for:** Multi-word names, titles, surnames

Split both the query and each candidate name into word tokens. Score by best token-level alignment rather than whole-string comparison. If any single token from the query is an exact or near-exact match to any token in a candidate name, return a high score regardless of the full string similarity.

Example: `"Ashford"` → tokens `["ashford"]` matched against `"Lady Ashford"` → tokens `["lady", "ashford"]` yields a score of 1.0 on the best token pair.

A useful extension: maintain a configurable list of title tokens (`sir`, `lady`, `lord`, `the`, `of`, `von`, `de`) to strip or deprioritize during matching.

**Strengths:**
- Natural fit for "first name only" or "last name only" queries
- Title prefixes stop polluting full-string scores
- Composable with any character-level metric applied per token

**Weaknesses:**
- Needs careful tie-breaking when multiple candidates share a surname or title
- Increases implementation complexity slightly
- Token splitting on non-Latin fantasy names may need custom rules

---

### Alternative: Phonetic encoding (Double Metaphone)

**Best for:** Sound-alike names, non-standard fantasy spellings

Encode both the query and each candidate with Double Metaphone (available in the `natural` package). Two names that share a phonetic code are treated as a strong candidate match even if their spelling differs significantly.

Pre-compute phonetic codes for all names during `RefreshCache()` and store them alongside the names. At query time, encode the query and check for code equality before falling back to fuzzy scoring.

Example matches this would catch:
- `"Rhys"` / `"Reece"`
- `"Caelan"` / `"Kaylan"`
- `"Siobhan"` / `"Shivawn"`
- `"Zephyrine"` / `"Zefirin"`

**Strengths:**
- Catches phonetically identical names that have zero character-level similarity
- Fast at query time — encoding is precomputed, comparison is string equality
- Double Metaphone handles more edge cases than Soundex or Metaphone 1

**Weaknesses:**
- Purely phonetic — misses visual typos with no phonetic component
- Fantasy names with genuinely invented pronunciations may encode incorrectly
- Should be used as a secondary scoring boost, not a primary gate

---

### Alternative: Prefix / abbreviation index

**Best for:** Fast lookups, short queries, known aliases

Build an inverted index of all name prefixes (and first-token prefixes) at cache load time. On any query of 3+ characters, check this index first for exact prefix hits before doing any fuzzy comparison. Also support explicit alias or nickname registration (e.g. `"Thorn"` → `"Thornwood the Grey"`).

This provides O(1) lookup for the common case and eliminates false-positive fuzzy matches when a player simply hasn't finished typing the full name.

**Strengths:**
- Instant for the most common player typing pattern
- Zero false positives for unambiguous prefix matches
- Supports explicit nickname/alias registration as a first-class feature

**Weaknesses:**
- No help for typos or phonetic mismatches — must be combined with fuzzy fallback
- Requires index rebuild on cache refresh (already happening in `RefreshCache()`)
- Index collisions when many names share a common prefix require ranking logic

---

### Hybrid: Normalization layer + multi-metric scoring

**Best for:** General-purpose improvement, recommended foundation

Before any fuzzy comparison, normalize both the query and all candidates:

1. Lowercase
2. Strip punctuation and diacritics (normalize Unicode to NFC, strip combining marks)
3. Collapse multiple whitespace characters
4. Optionally strip leading title words (`sir`, `lady`, `lord`, `the`, `of`, `von`, `de`)

Then score each candidate using a **weighted combination** of signals:

| Signal | Description | Suggested weight |
|---|---|---|
| Exact match after normalization | Direct equality post-normalization | 1.0 (short-circuit) |
| Best token exact match | Any token pair is exact | 0.95 |
| Jaro-Winkler (full normalized name) | Full-string prefix-weighted similarity | 0.5× |
| Jaro-Winkler (best token pair) | Per-token max similarity | 0.5× |

Final score = max of all signals. Weights are tunable without structural changes.

**Strengths:**
- Handles the most common failure modes in a single pass
- Normalization alone fixes a large class of current bugs
- Tunable without changing the overall structure
- Compatible with the existing return shape — no downstream changes needed

**Weaknesses:**
- More code to maintain than the current single-library approach
- Weight tuning benefits from a labeled test set
- Still O(n) scan unless combined with a prefix index or n-gram filter

---

### Hybrid: Two-stage — index filter → fuzzy rank

**Best for:** Large character caches, best combined performance and accuracy

This is how production fuzzy search engines work internally.

**Stage 1 (at `RefreshCache()` time):** Build an inverted index mapping character bigrams or trigrams to the list of names that contain them.

**Stage 2 (at query time):**
1. Extract n-grams from the normalized query.
2. Use the index to retrieve only candidates sharing at least K n-grams with the query — typically reducing hundreds of candidates to a handful.
3. Run full multi-metric scoring (Jaro-Winkler + token match + optional phonetics) only on this small candidate set.

This reduces per-query cost from O(n · name_length) to approximately O(k · name_length) where k << n.

**Strengths:**
- Sublinear performance at query time — scales gracefully as the character list grows
- Full scoring quality is preserved on the filtered candidate set
- N-gram overlap is a strong and well-studied recall signal

**Weaknesses:**
- Most complex to implement of all the options here
- Index must be rebuilt on every `RefreshCache()` call (acceptable given it runs at startup)
- Very short queries (1–2 characters) produce few n-grams and give poor recall from the index; needs a fallback for short queries

---

### Hybrid: Dynamic threshold by query length

**Best for:** Reducing false positives on short queries

Replace the flat `MIN_THRESHOLD = 0.15` with a function that scales with query length. Very short queries require near-exact matching; longer queries can tolerate more fuzz.

Example curve:
```js
function dynamicThreshold(queryLength) {
  // Asymptotes toward ~0.9 for long queries, ~0.5 for 3-char queries
  return 0.5 + 0.4 * (1 - Math.exp(-queryLength / 6));
}
```

Additionally, apply a lower threshold when searching within a single user's characters (small candidate pool, low false-positive risk) versus searching all characters globally (large pool, higher risk).

**Strengths:**
- Directly targets the false-positive problem with minimal code
- Simple to layer on top of any scoring approach
- The per-user vs. global distinction is already present in the existing code structure

**Weaknesses:**
- Threshold curve needs empirical validation — use `nameMatchTest()` as the harness
- May increase false negatives for genuinely short names (`"Al"`, `"Oz"`) unless combined with better scoring

---

## Suggested Implementation Order

### Step 1 — Normalization (immediate, low risk)

Add a normalization pass before any comparison. Lowercase, strip punctuation, collapse whitespace, strip title words. This is the highest ROI change and requires no new dependencies.

```js
const TITLE_WORDS = new Set(['sir', 'lady', 'lord', 'the', 'of', 'von', 'de', 'du']);

function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip diacritics
    .replace(/[^\w\s]/g, '')                            // strip punctuation
    .split(/\s+/)
    .filter(t => !TITLE_WORDS.has(t))
    .join(' ')
    .trim();
}
```

### Step 2 — Token-level Jaro-Winkler (low risk)

Replace whole-string Dice with per-token Jaro-Winkler scoring, taking the maximum over all token pair combinations. This alone handles `"Ashford"` → `"Lady Ashford"` and most prefix-typed queries.

Switch from `string-similarity` to `natural`, which provides both Jaro-Winkler and (for later steps) Double Metaphone and Levenshtein under one dependency.

### Step 3 — Dynamic thresholding (medium)

Add the dynamic threshold function. Validate values using the existing `nameMatchTest()` method — it's already a solid harness for this kind of empirical tuning.

### Step 4 — Phonetic scoring boost (optional)

Add a Double Metaphone pass as a secondary scoring bonus for phonetic near-misses. Wire it as an additive signal to the score rather than a hard gate, e.g. `if (metaphone(query) === metaphone(candidate)) score = Math.max(score, 0.85)`.

Pre-compute codes during `RefreshCache()` and store them in the char objects.

### Step 5 — N-gram index (if performance becomes an issue)

Add the inverted n-gram index for sublinear candidate filtering at query time. Build the index inside `RefreshCache()` so it's always fresh. Use bigrams for better short-name recall than trigrams.

---

## Notes on the Existing Test Harness

The `nameMatchTest()` method at the bottom of the file is already well-suited as a regression and tuning harness. It:

- Compares tupper log names against the character cache
- Reports matches in the ambiguous middle range (`MIN_THRESHOLD ≤ score < MATCH_THRESHOLD`) where the user doesn't match the character owner
- These are exactly the false-positive cases you want to eliminate

Before and after each change in the implementation order above, run `nameMatchTest()` and compare the output. A good change should shrink this list without removing true matches.

---

*Document generated from code review of `charUtils.js` — `steffleupagus/DM-Secretary` branch `_dev_approval-main`*
