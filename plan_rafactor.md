# Refactor Plan

This document identifies opportunities to consolidate shared code, eliminate duplication, and fix latent bugs discovered during a full review of the codebase. The project is a Discord bot for a roleplay server, built with Discord.js and Mongoose.

---

## 1. Centralise Config Loading

**Problem:** Every single file in `handlers/`, `utilities/`, and `database/` repeats this exact two-line boilerplate:

```js
const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);
```

This appears in at least 25 files. The relative path changes depth (`../`, `../../`) depending on location, which is fragile and has already caused issues.

**Fix:** Create a single `utilities/config.js` (or `config/index.js`) module that loads and exports the config object once. Every file then does:

```js
const config = require('../utilities/config.js');
```

This removes 25+ instances of duplicated logic and makes switching environments (via `mod`) a single-file concern.

---

## 2. Deduplicate Exp Cap Arrays (Bug Risk)

**Problem:** In `utilities/expUtils.js`, `getDuelExpCap()` and `getRPExpCap()` contain **identical hardcoded arrays**. The file even contains commented-out alternative arrays that differ between the two functions — evidence that one was updated and the other was not.

```js
// getDuelExpCap — identical data to getRPExpCap
const cap = [ 0, 0, 0, 150, 250, 500, 600, 750, 900, ... ]

// getRPExpCap — identical data to getDuelExpCap
var cap = [ 0, 0, 0, 150, 250, 500, 600, 750, 900, ... ]
```

This is a latent sync bug. If one table is updated, the other must also be updated manually.

**Fix:** Define a single `EXP_CAP_BY_LEVEL` constant array in `expUtils.js` and have both functions reference it. If the duel cap genuinely needs to differ from the RP cap in the future, the split can be re-introduced deliberately at that point.

---

## 3. Undefined Variables in `roleplayUtils.js` (Bug)

**Problem:** `utilities/roleplayUtils.js` uses the following identifiers that are **never defined or imported** in that file:

- `MIN_RP_THRESHOLD`
- `NPC`
- `SKIP`
- `Debug`
- `ERROR_CMD_CANCELED`

These are defined as local constants inside `utilities/funcsScene.js`. Because Node.js modules do not share scope, any code path in `roleplayUtils.js` that reaches these names will throw a `ReferenceError` at runtime.

**Fix:** Move these shared constants into a dedicated `utilities/sceneConstants.js` (or equivalent) module and import them in both `funcsScene.js` and `roleplayUtils.js`. They logically belong together and are already used across at least three files (`funcsScene.js`, `funcsDuel.js`, `roleplayUtils.js`).

The full list of constants that appear in multiple files and should be centralised:

| Constant | funcsScene.js | funcsDuel.js | roleplayUtils.js | charUtils.js |
|---|---|---|---|---|
| `MATCH_THRESHOLD` (0.9) | ✓ | — | ✓ | ✓ |
| `MIN_THRESHOLD` (0.15) | ✓ | — | — | ✓ |
| `MIN_RP_THRESHOLD` | ✓ | — | used, not defined | — |
| `NPC` (0) | ✓ | — | used, not defined | — |
| `SKIP` (-1) | ✓ | — | used, not defined | — |
| `Debug` | ✓ | ✓ | used, not defined | — |
| `ERROR_CMD_CANCELED` | ✓ | — | used, not defined | — |
| `PING_PREFIX` | ✓ | ✓ | — | — |
| `JSONURL` | ✓ | ✓ | — | — |
| `dmPingChannel` | ✓ | ✓ | — | — |

---

## 4. `botPermissions` Check Uses Wrong Property (Bug)

**Problem:** In `handlers/events/interactionCreate.js`, the bot permission check reads the wrong property:

```js
// Line ~94 — should be command.botPermissions
const botPermissions = command.userPermissions;  // ← BUG
```

As a result, the bot permission block re-checks `userPermissions` instead of the bot's own permissions. This means the bot never actually validates whether it has the permissions it needs before running a command.

**Fix:** Change `command.userPermissions` to `command.botPermissions` on that line.

---

## 5. `MutexException.toString()` Returns `undefined` (Bug)

**Problem:** In `utilities/mutexUtils.js`, the `MutexException` class defines a `toString()` method that references `this.error`, which is never set in the constructor (the field is stored as `this.message`). The method also returns `this.error`, which is always `undefined`.

```js
toString() {
    console.log("OOPS THIS DOESN'T EXIST!")  // ← left-in debug log
    console.log(this.error)                   // ← always undefined
    console.log(this.message, this.stack)
    return this.error;                        // ← always returns undefined
}
```

**Fix:** Replace `this.error` with `this.message` throughout the method and remove the debug log.

---

## 6. `processCharData` Argument Order Mismatch (Bug)

**Problem:** `processCharData` is defined in `roleplayUtils.js` with the signature:

```js
async function processCharData(charRPData, interaction, thread, forcePrompt, npcAssign)
```

But it is called in `funcsScene.js` as:

```js
editData = await processCharData(interaction, editData, true);
```

The first two arguments are **swapped**, passing the interaction where the character data is expected and vice versa. This will silently produce wrong results or throw when the function tries to operate on the interaction object as if it were character data.

**Fix:** Correct the argument order at the call site in `funcsScene.js`, or if `funcsScene.js` has its own local copy of `processCharData`, audit whether they are in sync and consolidate.

---

## 7. `promptUserReaction` Null Reference Risk (Bug)

**Problem:** In `utilities/promptUtils.js`, `promptUserReaction` calls `failOptions.includes(...)` without checking whether `failOptions` is non-null first:

```js
if (modDM || returnFirst || failOptions.includes(reaction.emoji.name)) {
```

The function signature declares `failOptions = null` as the default. If any caller passes `null` explicitly (or relies on the default), this will throw `TypeError: Cannot read properties of null`.

`promptUserButton` has the same issue.

**Fix:** Add a null guard: `(failOptions && failOptions.includes(...))` at both call sites, or change the default to `failOptions = []`.

---

## 8. Duplicate Name Filter Logic

**Problem:** `utilities/charUtils.js` (`CharacterData.getUserCharData`) and `utilities/guildUtils.js` (`GuildData.getAutoCompleteData`) both implement an almost identical `nameFilter` pattern:

```js
// charUtils.js
result = Object.fromEntries(Object.entries(result).filter(([name]) =>
    name.toLowerCase().includes(nameFilter)));

// guildUtils.js
result = Object.fromEntries(Object.entries(result).filter(([name]) =>
    name.toLowerCase().includes(nameFilter)));
```

**Fix:** Extract into a shared helper function in `utilFuncs.js`, e.g. `filterByNameKey(obj, nameFilter)`.

---

## 9. Oversized Modules Should Be Split

**Problem:** Two files are doing too much and are difficult to navigate or test in isolation:

- `utilities/funcsScene.js` — 1412 lines handling scene parsing, data processing, player prompting, DM approval, XP application, and embed generation.
- `handlers/commands/cmd_Guild.js` — 1166 lines handling guild display, rank changes, role toggling, character prompting, and autocomplete.

**Suggested splits:**

- `funcsScene.js` → `sceneParser.js` (message gathering), `sceneProcessor.js` (data logic), `sceneEmbeds.js` (embed builders), keeping `funcsScene.js` as the entry-point orchestrator.
- `cmd_Guild.js` → extract the role-toggle logic into `utilities/guildRoleUtils.js` and the embed builders into their own helper, leaving the command handler file thin.

---

## 10. Leftover Debug Logs and Dead Code

**Problem:** Several production code paths include debug `console.log` calls with unclear intent or explicit notes that they're unfinished:

- `roleplayUtils.js` line ~82: `console.log('\n\n\nI DON\'T REMEMBER WHAT .sameUser IS FOR...')`
- `roleplayUtils.js` lines ~92, 101: raw `console.log` of internal objects with no surrounding context
- `funcsScene.js` lines ~215, 236: `console.log("Data: ", data)` and similar
- `handlers/commands/cmd_EndDuel.js` line ~76: `console.log(interaction)` with no context
- `handlers/commands/admincmd_GuildSetup.js` lines ~60, 66: `console.log(record)` and `console.log(emoji)`

These produce noise in logs and in some cases leak internal object structure.

**Fix:** Either remove them or replace with a structured logger that can be toggled by `config.DEV`. A minimal `utilities/logger.js` wrapping `console.log`/`console.error` gated on an environment flag would bring all debug output under control.

---

## 11. Hardcoded IDs Outside Config

**Problem:** Several hardcoded Discord snowflake IDs appear directly in source files rather than in config:

- `utilities/channelUtils.js` line ~97: `"1001640103841632306"` (OpenRP role ID)
- `utilities/messageUtils.js` line ~326: `<@659069077872181248>` (owner ping hardcoded inline)

These should live in the config file so they can be adjusted per environment without touching source code.

---

## 12. Misleading Variable Name in Timeout Handlers

**Problem:** In `utilities/promptUtils.js`, `awaitMessages` timeout/rejection handlers name the parameter `collected`, but in a `.catch()` callback the value is the error object, not collected messages:

```js
.catch(collected => {   // ← `collected` is actually the error object here
    channel.send('Timeout waiting for response.')
    ...
});
```

This appears in `promptUserInputOption`, `promptUserInput`, and `promptUserPing`.

**Fix:** Rename the parameter to `_err` or `_timeout` to make the intent clear.

---

## Priority Summary

| Priority | Item | Type |
|---|---|---|
| 🔴 High | #3 — Undefined vars in `roleplayUtils.js` | Bug |
| 🔴 High | #4 — `botPermissions` reads wrong field | Bug |
| 🔴 High | #6 — `processCharData` args swapped | Bug |
| 🟠 Medium | #2 — Duplicate exp cap arrays | Bug risk |
| 🟠 Medium | #5 — `MutexException.toString` returns undefined | Bug |
| 🟠 Medium | #7 — `failOptions.includes` null reference | Bug risk |
| 🟡 Low | #1 — Config loading boilerplate | Maintainability |
| 🟡 Low | #8 — Duplicate name filter logic | Maintainability |
| 🟡 Low | #9 — Oversized modules | Maintainability |
| 🟡 Low | #10 — Debug logs in production | Cleanliness |
| 🟡 Low | #11 — Hardcoded IDs | Maintainability |
| 🟡 Low | #12 — Misleading param names | Readability |
