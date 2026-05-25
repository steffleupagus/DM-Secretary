/**
 * charMatchUtils.js
 * =================
 * Unified character name matching utility library for DM-Secretary.
 *
 * BACKGROUND
 * ----------
 * This library consolidates two previously divergent matching systems:
 *
 *   1. charUtils.js → findClosestMatch()
 *      Real-time player query → character lookup. Used during active RP sessions.
 *      Previously: Dice coefficient only, no normalization, flat MIN_THRESHOLD = 0.15.
 *
 *   2. admincmd_ParseProfiles.js → generateSingleCharMatches() / computeSimilarity()
 *      Admin batch tool: reconcile profile records against sheet records.
 *      Previously: Dice + normalized Levenshtein, simplifyName() normalization,
 *      generatePartialCharMatch() word-boundary fallback, Munkres optimal assignment.
 *
 * Both callers now import from this module instead of maintaining separate logic.
 *
 * DEPENDENCIES
 * ------------
 *   "string-similarity"  — already in package.json (Dice coefficient)
 *   "fast-levenshtein"   — already in package.json (edit distance)
 *   "munkres-js"         — already in package.json (optimal assignment)
 *
 * No new dependencies are introduced.
 *
 * EXPORTS
 * -------
 * See individual JSDoc blocks below. Summary:
 *
 *   normalizeName(name)
 *     Full normalization: diacritics, punctuation, case, title words.
 *
 *   computeSimilarity(name1, name2)
 *     Dual-metric score using a disagreement-weighted blend of Dice and
 *     normalized Levenshtein. Reduces false negatives vs. either metric alone
 *     while moderating the false positives introduced by a pure Math.max.
 *     Both inputs should be pre-normalized.
 *
 *   findPartialMatch(queryName, candidateName)
 *     Word-boundary token matching for names that share a significant whole word
 *     but differ too much for fuzzy metrics to catch (e.g. "Ashford" vs "Lady Ashford").
 *     Both inputs should be pre-normalized.
 *
 *   findPrePostFixMatch(queryName, candidateName)
 *     Token-level prefix matching for abbreviations and truncated names
 *     (e.g. "Des" for "Desdemona", "Thorn" for "Thornwood").
 *     Covers the case class that findPartialMatch cannot handle because
 *     word-boundary regex requires a complete token, not a prefix.
 *     Both inputs should be pre-normalized.
 *
 *   findBestMatch(query, candidates, options)
 *     Single-query → ranked candidate list. Replaces StringSimilarity.findBestMatch scoring.
 *     Falls back through findPartialMatch then findPrePostFixMatch for scores below threshold.
 *     Returns { bestMatch, ratings, rawRatings }.
 *
 *   findAllMatches(listA, listB, options)
 *     N×M matching across two record lists with Munkres optimal assignment.
 *     Replaces ParseProfiles generateAllCharMatches / generateUnmatched.
 *     Returns { matches, unmatched: { a, b } }.
 *
 *   findDuplicates(records, options)
 *     Within-list duplicate detection (groups of suspiciously similar names).
 *     Replaces ParseProfiles generateDuplicates.
 *     Returns an array of duplicate groups.
 *
 * THRESHOLD CONSTANTS
 * -------------------
 *   THRESHOLD.BESTMATCH   (0.40) — minimum score for findBestMatch (real-time lookups).
 *                                  Raised from the old charUtils value of 0.15 to reduce
 *                                  false positives. Tune downward if legitimate matches
 *                                  are being missed.
 *
 *   THRESHOLD.ALLMATCHES  (0.50) — minimum score for findAllMatches / findDuplicates.
 *                                  Carries over from ParseProfiles; appropriate for
 *                                  admin reconciliation where precision matters more.
 *
 *   THRESHOLD.DUPLICATE  (0.70) — minimum score to treat two names as probable duplicates.
 *                                 Carries over from ParseProfiles generateDuplicates.
 *
 * USAGE EXAMPLES
 * --------------
 * See bottom of this file for copy-paste migration examples for both callers.
 */

"use strict";

const StrComp = require("string-similarity");
const Levenshtein = require("fast-levenshtein");
const Munkres = require("munkres-js");

// ─── Threshold constants ────────────────────────────────────────────────────
const THRESHOLD = {
	BESTMATCH: 0.5,
	ALLMATCHES: 0.5,
	DUPLICATE: 0.7
};

// ─── Normalization ───────────────────────────────────────────────────────────

/**
 * Common words/tokens in character names that can be stripped during normalization
 * e.g. "Sir Aldric" and "Lord Aldric" should both reduce to "aldric" for matching.
 * Extend as new title patterns are encountered in character names
 */
const TITLE_WORDS = new Set([
	"sir","lady","lord",
	"dame","master","mistress",
	"the","of","in","on",
	"von","de","du","van","af",
]);

/**
 * normalizeName(name)
 * -------------------
 * Produce a clean, comparable form of a character name for fuzzy matching.
 * Steps applied in order:
 *   1. NFD Unicode decomposition + strip combining marks (diacritics).
 *      (i.e. "Élara" → "Elara", "Björn" → "Bjorn")
 *   2. Strip all non-alphanumeric, non-space characters (punctuation, quotes, hyphens).
 *      "Ash'kar the Bold" → "Ashkar the Bold"
 *   3. Lowercase and trim surrounding whitespace.
 *   4. Split on whitespace, remove TITLE_WORDS tokens, rejoin.
 *      "Sir Aldric of Thornwood" → "aldric thornwood"
 *   5. Collapse any remaining internal whitespace runs to single space.
 *
 * @param   {string} name  — raw character name (from DB, user input, or profile record)
 * @returns {string}       — normalized name, suitable for metric comparison
 * @example
 *   normalizeName("Sir Élara the Swiftblade")  // → "elara swiftblade"
 *   normalizeName("  Lady Ashford  ")           // → "ashford"
 *   normalizeName("Ash'kar")                    // → "ashkar"
 */
function normalizeName(name) {
	if (!name || typeof name !== "string") return "";
	return (
		name
			// Step 1: decompose Unicode and strip diacritical combining marks
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			// Step 2: strip everything except alphanumerics and spaces
			.replace(/[^a-zA-Z0-9\s]/g, "")
			// Step 3: lowercase and trim
			.trim()
			.toLowerCase()
			// Steps 4 + 5: split, filter title words, collapse whitespace
			.split(/\s+/)
			.filter((token) => token.length > 0 && !TITLE_WORDS.has(token))
			.join(" ")
	);
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

/**
 * computeSimilarity(name1, name2)
 * --------------------------------
 * Returns a similarity score in [0, 1] between two pre-normalized names.
 * A score of 1.0 is a perfect match; 0.0 is completely dissimilar.
 *
 * METRICS
 * -------
 *   Dice coefficient (via string-similarity)
 *     Measures shared bigram overlap. Strong on character transpositions,
 *     substitutions, and names of similar length. Weak when one name is
 *     a prefix or substring of the other (e.g. "Des" vs "Desdemona" shares
 *     few bigrams relative to the longer name's total).
 *
 *   Normalized Levenshtein distance
 *     Counts minimum single-character edits (insert / delete / substitute).
 *     Normalized to [0,1] as: 1 − (distance / max(len_a, len_b)).
 *     Strong on insertions/deletions and prefix-typed partial names.
 *     Weak on anagram-like rearrangements.
 *
 * BLENDING STRATEGY
 * -----------------
 * Rather than a pure Math.max (which unconditionally trusts whichever metric
 * is more enthusiastic), the result is a disagreement-weighted blend:
 *
 *   disagreement = |dice − lev|
 *   result = max(dice, lev) * (1 − disagreement)
 *          + avg(dice, lev) * disagreement
 *
 * When both metrics agree (disagreement → 0), the result approaches Math.max
 * and the higher score is trusted. When the metrics strongly disagree
 * (disagreement → 1), the result approaches their average, moderating the
 * overconfident metric.
 *
 * This preserves legitimate abbreviation matches like "Des"/"Desdemona"
 * (Levenshtein is high but Dice also produces meaningful signal, so
 * disagreement is moderate and the result stays above threshold) while
 * pulling down coincidental short-name matches like "Zara"/"Kara"
 * (Levenshtein is high but Dice is cold, disagreement is large, result
 * is pulled toward the average).
 *
 * The blend is fully continuous — no hard branches or magic constants.
 * The disagreement value itself drives the interpolation, so the only
 * tunable parameter is THRESHOLD.BESTMATCH, which can be validated
 * empirically with nameMatchTest().
 *
 * NOTE: Both inputs should be passed through normalizeName() before calling
 * this function. Comparing raw names (different case, punctuation, title words)
 * will produce lower and less reliable scores.
 *
 * @param   {string} name1  — normalized name
 * @param   {string} name2  — normalized name
 * @returns {number}        — similarity score in [0, 1]
 */
function computeSimilarity(name1, name2) {
	// Edge case: two empty strings are defined as identical
	const maxLength = Math.max(name1.length, name2.length);
	if (maxLength === 0) return 1.0;

	const dice = StrComp.compareTwoStrings(name1, name2);
	const lev = 1 - Levenshtein.get(name1, name2) / maxLength;

	// Disagreement-weighted blend.
	// disagreement=0 → result equals Math.max(dice, lev)  (metrics agree, trust the higher)
	// disagreement=1 → result equals (dice + lev) / 2     (metrics disagree, split the difference)
	const disagreement = Math.abs(dice - lev);
	return (
		Math.max(dice, lev) * (1 - disagreement) +
		((dice + lev) / 2) * disagreement
	);
}

// ─── Partial / token matching ────────────────────────────────────────────────

/**
 * findPartialMatch(queryName, candidateName)
 * ------------------------------------------
 * Detects whether two names share at least one significant *whole word*, even
 * when their full-string similarity scores are too low to pass the threshold.
 *
 * This handles the case where a player types a single token from a multi-word
 * name — e.g. "Ashford" for "Lady Ashford", or "Thornwood" for "Sir Thornwood
 * of Aldenmere" — and the fuzzy metric gives a low score because the extra
 * words dominate the comparison.
 *
 * IMPORTANT LIMITATION: this function uses word-boundary regex (\b), which
 * requires the matched token to appear as a *complete* word in the target
 * string. It will NOT catch prefix abbreviations like "Des" inside "Desdemona"
 * because there is no word boundary after "des" within the continuous token.
 * Use findPrePostFixMatch() for that case.
 *
 * Algorithm:
 *   1. Split both names on whitespace; filter out TITLE_WORDS tokens.
 *   2. For each token in candidateName, test if it appears as a whole word (\b)
 *      in queryName (case-insensitive).
 *   3. Repeat in the other direction: each token in queryName tested against
 *      candidateName.
 *   4. Collect the union of all matched tokens (deduped).
 *   5. Return the matched token array if any hits were found, null otherwise.
 *
 * NOTE ON CONTAINMENT: substring containment (e.g. "des" inside "desdemona")
 * is intentionally NOT checked here. That logic was removed because it caused
 * the function to return [] — an empty array, truthy in JS — when containment
 * fired but no whole-word token hit was found. This blocked findPrePostFixMatch
 * from being reached in the fallback chain and incorrectly floored scores with
 * no matched tokens to show. Prefix/substring cases are handled exclusively by
 * findPrePostFixMatch.
 *
 * The caller should treat a non-null return as a "partial match" signal and
 * floor the score at the relevant threshold to prevent the match from being
 * discarded, while flagging it for human review (it is not a confident match).
 *
 * NOTE: Inputs should be pre-normalized via normalizeName() for consistent
 * token filtering and case handling.
 *
 * Extended from the original:
 *   - Uses the shared TITLE_WORDS set instead of a local inline array ["the","in","on","of"].
 *   - Unified parameter naming (queryName / candidateName instead of
 *     profileName / sheetName) to reflect use from both callers.
 *
 * @param   {string}        queryName      — normalized name to search from
 * @param   {string}        candidateName  — normalized name to search against
 * @returns {string[]|null} — array of matched tokens if a partial match exists,
 *                            null if no shared significant whole word was found
 *
 * @example
 *   findPartialMatch('ashford', 'lady ashford')       // → ['ashford']
 *   findPartialMatch('thornwood', 'thornwood grey')   // → ['thornwood']
 *   findPartialMatch('des', 'desdemona')              // → null  (prefix, not whole word)
 *   findPartialMatch('zara', 'elara swiftblade')      // → null
 */
function findPartialMatch(queryName, candidateName) {
	// Split to significant tokens, dropping title/stopwords.
	// TITLE_WORDS are already stripped by normalizeName, but we filter again
	// here defensively in case un-normalized names are passed directly.
	const toTokens = (name) =>
		name.split(/\s+/).filter((t) => t.length > 0 && !TITLE_WORDS.has(t));

	const queryTokens = toTokens(queryName);
	const candidateTokens = toTokens(candidateName);

	// Word-boundary regex: does a token from one name appear as a complete word
	// inside the other name's full string?
	const wordBoundaryHits = (tokens, targetString) =>
		tokens.map(
			(token) =>
				new RegExp(`\\b${token}\\b`, "i").test(targetString)
					? token
					: "",
			//new RegExp(`\\b${token}`, 'i').test(targetString) ? token : ''
		);

	const candidateHitsInQuery = wordBoundaryHits(candidateTokens, queryName);
	const queryHitsInCandidate = wordBoundaryHits(queryTokens, candidateName);

	const allHits = [...candidateHitsInQuery, ...queryHitsInCandidate].filter(
		(t) => t,
	);
	const uniqueHits = [...new Set(allHits)];

	// Return the matched tokens only if at least one whole-word hit was found.
	// Substring containment (e.g. "des" inside "desdemona") is intentionally NOT
	// checked here — that case belongs to findPrePostFixMatch, which handles prefix
	// relationships via token-level startsWith. Including substring containment
	// here causes findPartialMatch to return [] (truthy but empty) for prefix
	// cases, which then blocks findPrePostFixMatch from being reached in the fallback
	// chain and incorrectly floors the score with no matched tokens to show.
	return uniqueHits.length > 0 ? uniqueHits : null;
}

/**
 * findPrePostFixMatch(queryName, candidateName)
 * ------------------------------------------
 * Detects whether any token in one name is a prefix of any token in the other,
 * covering abbreviations and truncated name entries that findPartialMatch cannot
 * catch because they don't form a complete word boundary.
 *
 * Motivating example:
 *   "Des" typed for "Desdemona" — "des" is a prefix of "desdemona" but not a
 *   whole word within it, so \b matching returns nothing. This function catches
 *   that case.
 *
 * Further examples:
 *   "Thorn" → "Thornwood the Grey"  (prefix of first token)
 *   "Al"    → "Aldric"              (rejected: below MIN_PREFIX_LENGTH)
 *   "Ash"   → "Ashkar"              (accepted: 3 chars, clear prefix hit)
 *
 * Algorithm:
 *   1. Split both names into tokens; filter out TITLE_WORDS.
 *   2. For every pair of tokens (one from each name), identify the shorter
 *      and longer token.
 *   3. If the shorter token meets MIN_PREFIX_LENGTH and the longer token
 *      starts with the shorter token, record it as a prefix hit.
 *   4. Return the array of hit tokens if any were found, null otherwise.
 *
 * MIN_PREFIX_LENGTH (3)
 *   Prevents single- and double-character tokens from matching as prefixes of
 *   almost everything. "Al" (2 chars) would prefix "Aldric", "Alara",
 *   "Almira", "Aldenmere" and every other "al-" name — too broad to be useful.
 *   Three characters is a pragmatic floor; validate against your server's name
 *   data if you have many names sharing a 3-character root by convention.
 *
 * NOTE: Inputs should be pre-normalized via normalizeName() before calling
 * this function.
 *
 * @param   {string}        queryName      — normalized name to search from
 * @param   {string}        candidateName  — normalized name to search against
 * @returns {string[]|null} — array of matched prefix tokens if found, null otherwise
 *
 * @example
 *   findPrePostFixMatch('des', 'desdemona')             // → ['des']
 *   findPrePostFixMatch('thorn', 'thornwood grey')      // → ['thorn']
 *   findPrePostFixMatch('ash', 'ashkar')                // → ['ash']
 *   findPrePostFixMatch('al', 'aldric')                 // → null  (below MIN_PREFIX_LENGTH)
 *   findPrePostFixMatch('zara', 'kara')                 // → null  (neither is a prefix of the other)
 */
const MIN_PREFIX_LENGTH = 3;

function findPrePostFixMatch(queryName, candidateName) {
	const toTokens = (name) =>
		name.split(/\s+/).filter((t) => t.length > 0 && !TITLE_WORDS.has(t));

	const queryTokens = toTokens(queryName);
	const candidateTokens = toTokens(candidateName);

	const hits = [];

	for (const qt of queryTokens) {
		for (const ct of candidateTokens) {
			// Identify which token is the potential prefix and which is the full form
			const shorter = qt.length <= ct.length ? qt : ct;
			const longer = qt.length <= ct.length ? ct : qt;

			// Require a minimum prefix length to avoid noise from very short tokens,
			// and confirm that the longer token actually begins with the shorter one.
			if (
				shorter.length >= MIN_PREFIX_LENGTH &&
				(longer.startsWith(shorter) || longer.endsWith(shorter))
			) {
				hits.push(shorter);
			}
		}
	}

	const uniqueHits = [...new Set(hits)];
	return uniqueHits.length > 0 ? uniqueHits : null;
}

// ─── Single-query lookup ─────────────────────────────────────────────────────

/**
 * findBestMatch(query, candidates, options)
 * ------------------------------------------
 * Scores a single query name against an array of candidate names and returns
 * ranked results. This is the core function for real-time character lookups
 * (replaces the scoring logic inside charUtils findClosestMatch).
 *
 * MATCHING PIPELINE
 * -----------------
 *   1. Normalize the query and all candidate names via normalizeName().
 *   2. Score every candidate with computeSimilarity() (disagreement-weighted
 *      blend of Dice and normalized Levenshtein).
 *   3. For candidates that still fall below the threshold, run a two-stage
 *      fallback:
 *        a. findPartialMatch() — whole-word token overlap (e.g. "Ashford" in
 *           "Lady Ashford"). Catches multi-word name truncations.
 *        b. findPrePostFixMatch()  — token prefix overlap (e.g. "Des" for
 *           "Desdemona"). Catches abbreviations that share no word boundary.
 *      If either fallback fires, the score is floored to the threshold and
 *      the matched tokens are recorded in the `partial` property for the
 *      caller to surface as a warning (these are lower-confidence matches).
 *   4. Sort all results descending by score.
 *   5. Determine the best match: highest score at or above the threshold.
 *
 * RETURN SHAPE
 * ------------
 * {
 *   bestMatch: {
 *     target:  string,    — original (un-normalized) candidate name
 *     rating:  number,    — score in [0, 1]
 *     index:   number,    — index in the original candidates array
 *     partial: string[]   — matched tokens (only present if this is a fallback match)
 *   } | null,
 *   ratings: Array<{      — all candidates at or above threshold, sorted descending
 *     target:  string,
 *     rating:  number,
 *     index:   number,
 *     partial: string[]?
 *   }>,
 *   rawRatings: Array<{   — all candidates with score > 0, sorted descending
 *     target:  string,    — useful for diagnostics and nameMatchTest()
 *     rating:  number,
 *     index:   number,
 *     partial: string[]?
 *   }>
 * }
 *
 * Returns { bestMatch: null, ratings: [], rawRatings: [] } if candidates is empty.
 *
 * Directly replaces:
 *   ParseProfiles generateSingleCharMatches(char, records)
 *   (charUtils findClosestMatch scoring — the full method is not replaced here
 *   since it also handles cache filtering, NPC injection, and return shaping)
 *
 * @param   {string}   query           — raw character name from user input
 * @param   {string[]} candidates      — array of raw candidate names to score against
 * @param   {object}   [options]
 * @param   {number}   [options.threshold=THRESHOLD.BESTMATCH]
 *                                     — minimum score to include in ratings / consider as bestMatch
 * @returns {{ bestMatch, ratings, rawRatings }}
 *
 * @example
 *   const names = ['Lady Ashford', 'Sir Aldric', 'Thornwood the Grey'];
 *
 *   // Multi-word truncation: caught by findPartialMatch fallback
 *   findBestMatch('Ashford', names).bestMatch.target   // → 'Lady Ashford'
 *
 *   // Abbreviation: caught by findPrePostFixMatch fallback (if computeSimilarity alone
 *   // doesn't clear the threshold at current settings)
 *   findBestMatch('Des', ['Desdemona', 'Aldric']).bestMatch.target  // → 'Desdemona'
 *
 *   // Normal fuzzy match
 *   findBestMatch('Aldric', names).bestMatch.target    // → 'Sir Aldric'
 */
function findBestMatch(query, candidates, options = {}) {
	const threshold = options.threshold ?? THRESHOLD.BESTMATCH;

	if (!candidates || candidates.length === 0) {
		return { bestMatch: null, ratings: [], rawRatings: [] };
	}

	const normalizedQuery = normalizeName(query);

	// Score every candidate with the primary metric
	const scored = candidates.map((rawName, index) => {
		const normalizedCandidate = normalizeName(rawName);
		const rating = computeSimilarity(normalizedQuery, normalizedCandidate);
		return { target: rawName, rating, index, partial: undefined };
	});

	// Fallback pass for candidates that didn't clear the threshold via computeSimilarity.
	// Stage (a): whole-word token match — covers "Ashford" → "Lady Ashford"
	// Stage (b): prefix token match    — covers "Des"     → "Desdemona"
	// Both stages record matched tokens in `partial` so the caller can flag the
	// match as lower-confidence and surface it to the user appropriately.
	scored.forEach((entry) => {
		if (entry.rating < threshold) {
			const normalizedCandidate = normalizeName(entry.target);

			const partialHits = findPartialMatch(
				normalizedQuery,
				normalizedCandidate,
			);
			// Explicit null check (not truthiness) because both functions return
			// either a non-empty string[] or null — never an empty array after the
			// findPartialMatch fix, but guarding explicitly makes the intent clear
			// and protects against any future regression.
			const prefixHits = partialHits !== null
				? null // partial already fired; no need to check prefix
				: findPrePostFixMatch(normalizedQuery, normalizedCandidate);

			const hits = partialHits !== null ? partialHits : prefixHits;
			if (hits !== null) {
				entry.partial = hits;
				entry.rating = Math.max(entry.rating, threshold);
			}
		}
	});

	// Sort descending by score
	scored.sort((a, b) => b.rating - a.rating);

	const ratings = scored.filter((e) => e.rating >= threshold);
	const rawRatings = scored.filter((e) => e.rating > 0);

	// Best match: top of the threshold-filtered list; null if nothing qualifies
	const bestMatch = ratings.length > 0 ? ratings[0] : null;

	return { bestMatch, ratings, rawRatings };
}

// ─── Batch N×M matching ──────────────────────────────────────────────────────

/**
 * findAllMatches(listA, listB, options)
 * --------------------------------------
 * Finds the globally optimal 1:1 assignment between two lists of named records
 * using the Munkres (Hungarian) algorithm. Designed for admin batch reconciliation
 * (e.g. matching profile records against sheet records).
 *
 * WHY MUNKRES?
 * A greedy approach (take the highest-scoring pair, remove both, repeat) fails
 * when one strong pair "steals" a record that another pair needed more. Munkres
 * guarantees a globally optimal assignment: the set of matched pairs whose total
 * combined score is maximized.
 *
 * PIPELINE
 * --------
 *   1. Normalize all names from both lists.
 *   2. Build an N×M similarity matrix using computeSimilarity().
 *   3. For cells that fall below the threshold, attempt findPartialMatch() then
 *      findPrePostFixMatch() and floor the score if either fires (flagged on the
 *      match object).
 *   4. Convert the similarity matrix to a cost matrix (cost = 1 − score).
 *   5. Run Munkres on the cost matrix to get the optimal index assignment.
 *   6. Filter out assigned pairs where the score is still below threshold
 *      (Munkres must assign every row — some assignments are genuinely "no match").
 *   7. Build unmatched lists for records from both lists that were not assigned
 *      a qualifying partner.
 *
 * RECORD SHAPE REQUIREMENTS
 * -------------------------
 * Both listA and listB must be arrays of objects with at minimum a `name` field.
 * All other fields are passed through to the match results unchanged.
 *
 * RETURN SHAPE
 * ------------
 * {
 *   matches: Array<{
 *     a:       object,    — record from listA
 *     b:       object,    — record from listB
 *     score:   number,    — similarity score
 *     partial: string[]?  — token match array (only present for fallback matches)
 *   }>,
 *   unmatched: {
 *     a: object[],        — listA records with no qualifying match in listB
 *     b: object[],        — listB records with no qualifying match in listA
 *   }
 * }
 *
 * Directly replaces:
 *   ParseProfiles generateAllCharMatches(profileRecords, sheetRecords)
 *   ParseProfiles generateUnmatched(profileRecords, sheetRecords, matches)
 *
 * NOTE on the ParseProfiles bug: the original function computed both
 * optimalMatches (Munkres) and greedyMatches but returned optimalMatches only.
 * The greedy block also had a comparison bug (comparing x.profile.name against
 * x.profile, where the latter is already a string, not an object with a .name
 * property). The greedy implementation is not carried forward; if needed for
 * comparison it can be added as a separate exported function.
 *
 * @param   {object[]} listA            — array of records with at minimum { name: string }
 * @param   {object[]} listB            — array of records with at minimum { name: string }
 * @param   {object}   [options]
 * @param   {number}   [options.threshold=THRESHOLD.ALLMATCHES]
 *                                      — minimum score for a pair to be considered a match
 * @returns {{ matches, unmatched: { a, b } }}
 *
 * @example
 *   const profiles = [{ name: 'Sir Aldric', profileId: 'abc' }];
 *   const sheets   = [{ name: 'Aldric',     sheetId:   '123', level: 5 }];
 *   const { matches, unmatched } = findAllMatches(profiles, sheets);
 *   // matches[0].a.name  → 'Sir Aldric'
 *   // matches[0].b.name  → 'Aldric'
 *   // matches[0].score   → ~0.67
 */
function findAllMatches(listA, listB, options = {}) {
	const threshold = options.threshold ?? THRESHOLD.ALLMATCHES;

	// Degenerate cases: if either list is empty, everything is unmatched
	if (!listA || listA.length === 0) {
		return {
			matches: [],
			unmatched: { a: [], b: listB ? [...listB] : [] },
		};
	}
	if (!listB || listB.length === 0) {
		return { matches: [], unmatched: { a: [...listA], b: [] } };
	}

	// Pre-normalize all names once to avoid repeated work in the inner loop
	const normalizedA = listA.map((rec) => normalizeName(rec.name));
	const normalizedB = listB.map((rec) => normalizeName(rec.name));

	// Build similarity matrix: rows = listA, columns = listB.
	// Each cell stores the full match descriptor for retrieval after Munkres.
	const matrix = normalizedA.map((nameA, ai) =>
		normalizedB.map((nameB, bi) => {
			const score = computeSimilarity(nameA, nameB);

			// Fallback: partial then prefix, same two-stage chain as findBestMatch
			let partial = null;
			if (score < threshold) {
				partial =
					findPartialMatch(nameA, nameB) ??
					findPrePostFixMatch(nameA, nameB);
			}

			return {
				a: listA[ai],
				b: listB[bi],
				ai,
				bi,
				score: partial && score < threshold ? threshold : score,
				partial: partial ?? undefined,
			};
		}),
	);

	// Convert to cost matrix for Munkres (minimizes cost = maximizes similarity)
	const costMatrix = matrix.map((row) => row.map((cell) => 1 - cell.score));

	// Run Munkres to get optimal [rowIndex, colIndex] assignment pairs
	const assignment = Munkres(costMatrix);

	// Extract matched pairs that clear the threshold
	const matches = assignment
		.map(([ai, bi]) => matrix[ai][bi])
		.filter((cell) => cell.score >= threshold);

	// Build sets of matched indices for quick unmatched lookup
	const matchedAIndices = new Set(matches.map((m) => m.ai));
	const matchedBIndices = new Set(matches.map((m) => m.bi));

	const unmatched = {
		a: listA.filter((_, i) => !matchedAIndices.has(i)),
		b: listB.filter((_, i) => !matchedBIndices.has(i)),
	};

	// Strip internal index tracking properties from the returned match objects
	const cleanMatches = matches.map(({ a, b, score, partial }) =>
		partial !== undefined ? { a, b, score, partial } : { a, b, score },
	);

	return { matches: cleanMatches, unmatched };
}

// ─── Duplicate detection ─────────────────────────────────────────────────────

/**
 * findDuplicates(records, options)
 * ---------------------------------
 * Groups records within a single list whose names are suspiciously similar,
 * indicating likely duplicate entries (typos, alternate spellings, or records
 * accidentally submitted twice).
 *
 * ALGORITHM
 * ---------
 * Iterates the list in reverse (so splicing doesn't shift unvisited indices).
 * For each record (the "pivot"), groups it with any remaining records whose
 * normalized name scores at or above the duplicate threshold via
 * computeSimilarity(). Records consumed into a group are removed from the
 * working copy so they cannot seed their own group later.
 * Only groups with 2+ members are returned — lone records are not duplicates.
 *
 * This is a direct port and consolidation of ParseProfiles groupSimilar(),
 * which was previously defined as a closure inside generateDuplicates().
 *
 * NOTE: findPartialMatch / findPrePostFixMatch are intentionally NOT used here.
 * Duplicate detection should only flag names that are metrically close —
 * "Ashford" and "Lady Ashford" are not duplicates, they are a player typing
 * a known alias. Keep the threshold high (THRESHOLD.DUPLICATE = 0.70) and
 * rely on computeSimilarity alone.
 *
 * @param   {object[]} records             — array of records with at minimum { name: string }
 * @param   {object}   [options]
 * @param   {number}   [options.threshold=THRESHOLD.DUPLICATE]
 *                                         — minimum score to consider two names duplicates
 * @returns {object[][]}                   — array of groups; each group is an array of 2+
 *                                           records suspected to be duplicates of each other
 *
 * @example
 *   const sheets = [
 *     { name: 'Aldric Thornwood' },
 *     { name: 'Aldric Thornwood' },   // exact duplicate
 *     { name: 'Zara Nightveil' },
 *   ];
 *   findDuplicates(sheets);
 *   // → [[{ name: 'Aldric Thornwood' }, { name: 'Aldric Thornwood' }]]
 *
 *   const profiles = [
 *     { name: 'Elara Swiftblade' },
 *     { name: 'Élara Swiftblade' },   // diacritic variant — caught by normalization
 *     { name: 'Rhys ap Caern' },
 *   ];
 *   findDuplicates(profiles);
 *   // → [[{ name: 'Elara Swiftblade' }, { name: 'Élara Swiftblade' }]]
 */
function findDuplicates(records, options = {}) {
	const threshold = options.threshold ?? THRESHOLD.DUPLICATE;

	if (!records || records.length < 2) return [];

	// Shallow copy with pre-computed normalized names.
	// Original record references are preserved so callers receive their full objects.
	let working = records.map((rec) => ({
		record: rec,
		normalized: normalizeName(rec.name),
	}));

	const groups = [];

	// Reverse iteration: splice(x, 1) removes the pivot without shifting
	// the indices of items that haven't been visited yet (they are at lower indices).
	for (let x = working.length - 1; x >= 0; x--) {
		const pivot = working.splice(x, 1)[0];
		const group = [pivot.record];

		for (let y = working.length - 1; y >= 0; y--) {
			const score = computeSimilarity(
				pivot.normalized,
				working[y].normalized,
			);
			if (score >= threshold) {
				group.push(working[y].record);
				working.splice(y, 1); // consume: won't become a pivot itself
				x--; // compensate for the shrinking array length
			}
		}

		if (group.length > 1) groups.push(group);
	}

	return groups;
}

// ─── Module exports ───────────────────────────────────────────────────────────

module.exports = {
	// Constants — exported so callers can reference when setting their own threshold overrides
	THRESHOLD,

	// Core utilities (exported for direct use and for unit testing)
	normalizeName,
	computeSimilarity,
	findPartialMatch,
	findPrePostFixMatch,

	// High-level matching functions
	findBestMatch,
	findAllMatches,
	findDuplicates,
};

// =============================================================================
// MIGRATION GUIDE
// =============================================================================
//
// ── charUtils.js ─────────────────────────────────────────────────────────────
//
// BEFORE (at top of file):
//
//   const StringSimilarity = require("string-similarity");
//
// AFTER:
//
//   const CharMatch = require('./charMatchUtils');
//
// ---
//
// BEFORE (in findClosestMatch, after building the `names` array):
//
//   var matches = StringSimilarity.findBestMatch(char, names);
//   var match   = matches.bestMatch;
//   match = match.rating >= threshold ? { name: match.target, ... } : null;
//
// AFTER:
//
//   const result = CharMatch.findBestMatch(char, names, { threshold });
//   const best   = result.bestMatch;
//   var match = best
//     ? { name:   best.target,
//         ...(!user && { user: charTable[best.target].user }),
//         level:  charTable[best.target].level,
//         rating: best.rating }
//     : null;
//
//   // The ratings list is already filtered, sorted, and sliced cleanly:
//   var matchList = result.ratings
//     .map(m => ({
//       name:   m.target,
//       ...(!user && { user: charTable[m.target].user }),
//       level:  charTable[m.target].level,
//       rating: m.rating,
//     }))
//     .slice(0, 10);
//
// ---
//
// BEFORE (in nameMatchTest):
//
//   const matches = StringSimilarity.findBestMatch(tupper, names);
//   const match   = matches.bestMatch;
//
// AFTER:
//
//   const result = CharMatch.findBestMatch(tupper, names);
//   const match  = result.bestMatch;
//   // match.target and match.rating are the same fields as before.
//
//
// ── admincmd_ParseProfiles.js ─────────────────────────────────────────────────
//
// BEFORE (at top of file):
//
//   const StrComp      = require("string-similarity");
//   const Levenshtein  = require('fast-levenshtein');
//   const Munkres      = require('munkres-js');
//   const simplifyName = (name) => name.replace(/[^a-zA-Z0-9\s]/g,'').trim().toLowerCase();
//
// AFTER:
//
//   const CharMatch = require('../../utilities/charMatchUtils');
//   // Remove the StrComp, Levenshtein, Munkres requires and the simplifyName arrow.
//   // Remove the local computeSimilarity() and generatePartialCharMatch() functions.
//
// ---
//
// BEFORE (generateSingleCharMatches — entire body):
//
//   const simpleNames = names.map(name => simplifyName(name));
//   char = simplifyName(char.name || char);
//   const matches = StrComp.findBestMatch(char, simpleNames);
//   ...partial match block...
//
// AFTER:
//
//   const rawName = char.name || char;
//   const names   = records.map(item => item.name);
//   return CharMatch.findBestMatch(rawName, names, { threshold: THRESHOLD });
//   // result.bestMatch, result.ratings, result.rawRatings match the existing
//   // return shape expected by generateMatchOutput and generateRecordEmbed.
//
// ---
//
// BEFORE (generateAllCharMatches + generateUnmatched — both functions):
//
//   const sheetName   = simplifyName(sheet.name);
//   const profileName = simplifyName(profile.name);
//   const score       = computeSimilarity(profileName, sheetName);
//   ...partial + Munkres block...
//
// AFTER:
//
//   const { matches, unmatched } = CharMatch.findAllMatches(
//     profileRecords, sheetRecords, { threshold: THRESHOLD }
//   );
//   // matches[i].a  = profile record  (was: match.profile / match.db profile fields)
//   // matches[i].b  = sheet record    (was: match.sheet / match.db sheet fields)
//   // unmatched.a   = unmatched profiles
//   // unmatched.b   = unmatched sheets
//   // Pass into generateMatchEmbeds as before; update field access from
//   // match.profile / match.sheet to match.a.name / match.b.name as needed.
//
// ---
//
// BEFORE (generateDuplicates / groupSimilar):
//
//   const groupSimilar = (source, threshold = THRESHOLD) => { ...53 lines... }
//   profiles = groupSimilar(profiles, threshold)
//   sheets   = groupSimilar(sheets,   threshold)
//
// AFTER:
//
//   const profileGroups = CharMatch.findDuplicates(profiles, { threshold: 0.7 });
//   const sheetGroups   = CharMatch.findDuplicates(sheets,   { threshold: 0.7 });
//   // Each element of profileGroups / sheetGroups is an array of 2+ similar records.
//   // Pass into the existing output() formatter as before.
//
// =============================================================================
