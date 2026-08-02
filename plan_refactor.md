# Refactor Plan: funcsScene.js

## Overview

`funcsScene.js` is a 1,412-line file that does too much: it orchestrates the full scene-end pipeline, parses and identifies characters, manages player confirmation, builds DM approval embeds, and handles every DM button action. This plan splits that work into three focused utility modules while leaving `funcsScene.js` as a thin orchestrator.

---

## Goals

- **Separation of concerns**: each new file owns one coherent responsibility.
- **Reusability**: the character parsing and approval utilities can be imported independently (e.g. by `autoCloseScene`, future commands, or tests).
- **No behavioural changes**: this is a structural refactor only — no logic should change.
- **Preserve all exports**: `module.exports` in `funcsScene.js` remains unchanged from the call-site's perspective.

---

## Current Structure (abbreviated)

```
funcsScene.js (1412 lines)
│
├── Orchestration
│   ├── processScene()           — main entry point
│   └── autoCloseScene()         — auto-trigger entry point
│
├── Data computation
│   ├── consolidateData()
│   ├── assignExperience()
│   ├── generateXPEmbed()
│   └── generatePlayerXPField()
│
├── Message gathering (coordination only — raw fetch is in messageUtils.js)
│   └── [inline in processScene: MsgUtils.getRoleplayData → rpData.start check]
│
├── Character parsing & identification
│   ├── processData()
│   ├── processCharData()
│   ├── assignUnknownUser()
│   ├── assignUnknownCharacter()
│   └── constructLevelQuery()
│
└── Player/DM approval
    ├── awaitConfirmation()
    ├── generatePlayerConfirmEmbed()
    ├── sendDMApprovalMessage()
    ├── generateDMEmbed()
    ├── getApprovalButtonRow()
    ├── retrieveData()
    ├── unassignedNPC()
    ├── handleApprove()
    ├── handleReject()
    ├── handleEdit()
    ├── handleNPC()
    ├── handleUndo()
    └── handleUndoExp()
```

---

## Target Structure

```
utilities/
├── funcsScene.js          — orchestrator only (~200 lines target)
├── sceneCharUtils.js      — NEW: character parsing & identification
├── sceneApprovalUtils.js  — NEW: player & DM approval pipeline
└── messageUtils.js        — unchanged (already owns raw message fetching)
```

---

## New File 1: `utilities/sceneCharUtils.js`

### Responsibility
Resolve every scene participant from a raw name-and-stats blob to a fully identified `{ char, user, level, rp, daily, ... }` record. Prompts the player interactively when automatic matching is insufficient.

### Functions to move from `funcsScene.js`

| Function | Current lines | Notes |
|---|---|---|
| `processData(interaction, stats)` | ~1247–1284 | Top-level loop; calls `processCharData` per participant |
| `processCharData(interaction, charRPData, forcePrompt, npcAssign)` | ~1287–1367 | Core per-character resolution logic |
| `assignUnknownUser(interaction, name)` | ~1082–1112 | Prompts for unknown tupper owners |
| `assignUnknownCharacter(interaction, charRPData, npcAssign)` | ~1171–1239 | Dropdown + button prompt for character selection |
| `constructLevelQuery(charRPData, showPctMatch, npcAssign)` | ~1117–1164 | Builds the embed shown during `assignUnknownCharacter` |

### Constants to move

```js
const MATCH_THRESHOLD   = 0.9
const MIN_THRESHOLD     = 0.15
const MIN_RP_THRESHOLD  = 100
const NPC               = 0
const SKIP              = -1
const ERROR_CMD_CANCELED = "Command cancelled."
```

`NPC` and `SKIP` are used in both the character utils and the approval utils. Define them once here and import them in the other files.

### Dependencies this file will import

- `promptUtils.js` — `Prompt.promptUserPing`, `Prompt.collectAllInteractions`, `Prompt.createSelectRow`, `Prompt.createButtonRow`, `Prompt.createSelectOption`
- `charUtils.js` — `CharUtils.findClosestMatch`
- `discord.js` — `EmbedBuilder`, `ButtonStyle`
- `config` — `config.emoji.rpp`, `config.emoji.xp`, `config.role.*`

### Exports

```js
module.exports = {
    processData,
    processCharData,   // also needed by handleEdit and handleNPC in sceneApprovalUtils
    NPC,
    SKIP,
}
```

---

## New File 2: `utilities/sceneApprovalUtils.js`

### Responsibility
Everything that happens after characters are identified: player confirmation, DM embed construction, DM button handling (approve/reject/edit/NPC/undo), and the data encoding/decoding that carries scene records between messages.

### Functions to move from `funcsScene.js`

| Function | Current lines | Notes |
|---|---|---|
| `awaitConfirmation(interaction, expData)` | ~952–988 | Player-facing 👍/👎 confirm step |
| `generatePlayerConfirmEmbed(expData)` | ~922–945 | Builds the player-visible scene summary embed |
| `sendDMApprovalMessage(interaction, start, rpData, footer)` | ~893–908 | Posts to the DM ping channel with buttons |
| `generateDMEmbed(interaction, start, rpData, footer)` | ~800–888 | Builds the DM-facing embed with URL-encoded JSON payloads |
| `getApprovalButtonRow(interaction)` | ~910–918 | Builds the Approve / Reject / Edit button row |
| `retrieveData(source)` | ~349–388 | Decodes URL-encoded JSON from embed field links |
| `unassignedNPC(data)` | ~647–651 | Predicate: NPC with no awarded RPP |
| `handleApprove(interaction)` | ~461–503 | `scene.approve` button handler |
| `handleReject(interaction)` | ~572–643 | `scene.decline` button handler |
| `handleEdit(interaction)` | ~508–567 | `scene.edit` button handler |
| `handleNPC(interaction)` | ~656–791 | `scene.npc` button handler |
| `handleUndo(interaction)` | ~393–422 | `scene.undo` button handler |
| `handleUndoExp(interaction, message)` | ~424–455 | XP reversal helper called from `handleUndo` |

### Constants to move

```js
const JSONURL        = "http://tinyurl.com/tjson?input="
const OLDJSONURL     = "https://d.jsonx.repl.co?x="
const SCENEURL       = "https://discord.com/channels/"
const SCENE_EMBED_TITLE       = ...
const SCENE_EMBED_TITLE_AUTO  = ...
const SCENE_EMBED_DESC        = ...
const SCENE_EMBED_FOOTER      = ...
const CONFIRM_INSTRUCTIONS    = ...
const CONFIRM_FOOTER          = ...
const REFRESH_INSTRUCTIONS    = ...
const ERROR_SCENE_LOCKED      = "Already processing this scene. Please be patient."
const ERROR_CMD_CANCELED      = ...   // import from sceneCharUtils instead
const PING_PREFIX             = ...
const dmPingChannel           = ...
const xpLogChannel            = ...
const dmRoles                 = ...
```

### Dependencies this file will import

- `sceneCharUtils.js` — `processCharData`, `NPC`, `SKIP`
- `funcsScene.js` internal (after refactor) — `consolidateData`, `assignExperience`, `generateXPEmbed`, `generatePlayerXPField` — **see note below**
- `promptUtils.js` — `Prompt.confirmDialog`, `Prompt.createButtonRow`, `Prompt.createSelectRow`, `Prompt.createSelectOption`, `Prompt.createTextInputRow`, `Prompt.promptModal`, `Prompt.collectAllInteractions`, `Prompt.Time`
- `mutexUtils.js` — `Mutex.lock`, `Mutex.unlock`
- `expUtils.js` — `ExpUtils.updateDailyExp`
- `EmbedPaginator.js`
- `utilFuncs.js`
- `discord.js` — `EmbedBuilder`, `ButtonStyle`, `TextInputStyle`, `MessageMentions`
- `unb-api` — RPP balance editing
- `config`

> **Circular dependency note**: `generateDMEmbed`, `handleApprove`, `handleReject`, and `handleNPC` all call `consolidateData`, `assignExperience`, `generateXPEmbed`, and `generatePlayerXPField`, which are staying in `funcsScene.js`. To avoid a circular import, move those four computation functions into a new **`sceneDataUtils.js`** (see Option below) and import from there in both `funcsScene.js` and `sceneApprovalUtils.js`. Alternatively, pass them as parameters — but extraction is cleaner.

### Exports

```js
module.exports = {
    awaitConfirmation,
    sendDMApprovalMessage,
    generatePlayerConfirmEmbed,
    generateDMEmbed,
    retrieveData,
    handleApprove,
    handleReject,
    handleEdit,
    handleNPC,
    handleUndo,
}
```

---

## Circular Dependency Resolution: `utilities/sceneDataUtils.js`

Because `sceneApprovalUtils.js` needs `consolidateData`, `assignExperience`, `generateXPEmbed`, and `generatePlayerXPField` — and `funcsScene.js` also needs them — these four functions should be moved into their own file to break the potential circular chain.

| Function | Notes |
|---|---|
| `consolidateData(expData)` | Merges duplicate char records |
| `assignExperience(expData)` | Computes XP multiplier per record |
| `generateXPEmbed(interaction, start, rpData, comment, footer)` | Builds the posted XP log embed |
| `generatePlayerXPField(interaction, data, idx)` | Builds a single field + applies daily cap via `ExpUtils` |

Constants to include: `NPC_RPP_AMOUNT = 1000`, and import `NPC`, `SKIP` from `sceneCharUtils.js`.

Exports:
```js
module.exports = { consolidateData, assignExperience, generateXPEmbed, generatePlayerXPField }
```

---

## What Stays in `funcsScene.js`

After the split, `funcsScene.js` becomes an orchestrator with roughly 200 lines:

| Kept | Reason |
|---|---|
| `processScene(interaction, message)` | Main entry point; coordinates all phases |
| `autoCloseScene(message)` | Secondary entry point; same coordination pattern |
| `updateStatus(interaction, content)` | Trivial helper, tightly coupled to `processScene` |
| `CheckValidChannel(channel)` | Pre-condition check used only in `processScene` / `autoCloseScene` |
| `LogDebugResult(...)` | Debug-only, small, used only in commented-out calls in `processScene` |
| `interactionTimer` | State object used across `processScene` and `processCharData`; pass as argument or keep here |
| Step/error string constants used only in the orchestration flow | `STEP_*`, `ERROR_SCENE_LOCKED`, `SCENE_BREAK_CLOSER`, `SCENE_COMMAND_TIME` |
| `module.exports` | Unchanged |

`funcsScene.js` imports will become:
```js
const SceneChar     = require('./sceneCharUtils.js')
const SceneApproval = require('./sceneApprovalUtils.js')
const SceneData     = require('./sceneDataUtils.js')
```

---

## Note on Message Gathering

The raw message fetching is already handled by `messageUtils.js` (`MsgUtils.getRoleplayData`). The "message gathering" responsibility inside `funcsScene.js` is limited to calling that function and checking the returned `rpData.start` sentinel. This coordination belongs in `processScene` and does not need a new file. No changes to `messageUtils.js` are required.

---

## Migration Order

Execute the split in this order to keep the codebase runnable at each step:

1. **Create `sceneDataUtils.js`** — move `consolidateData`, `assignExperience`, `generateXPEmbed`, `generatePlayerXPField` and their constants. Update imports in `funcsScene.js`.

2. **Create `sceneCharUtils.js`** — move `processData`, `processCharData`, `assignUnknownUser`, `assignUnknownCharacter`, `constructLevelQuery` and their constants (`MATCH_THRESHOLD`, `MIN_RP_THRESHOLD`, `NPC`, `SKIP`). Update imports in `funcsScene.js`.

3. **Create `sceneApprovalUtils.js`** — move all approval/handler functions and their constants. Import from `sceneDataUtils` and `sceneCharUtils` as needed. Update `funcsScene.js` to import handlers from here.

4. **Clean up `funcsScene.js`** — remove dead code, imports that are no longer needed here, and the `interactionTimer` accumulation (move into `processCharData` signature if needed).

5. **Verify exports** — ensure `module.exports` in `funcsScene.js` still exposes `processScene`, `autoCloseScene`, `handleApprove`, `handleEdit`, `handleNPC`, `handleReject`, `handleUndo` (re-exported from `sceneApprovalUtils` where appropriate).

---

## File Summary

| File | Lines (est.) | Owns |
|---|---|---|
| `funcsScene.js` | ~200 | Orchestration only |
| `sceneCharUtils.js` | ~350 | Character parsing & identification |
| `sceneApprovalUtils.js` | ~550 | Player & DM approval, all button handlers |
| `sceneDataUtils.js` | ~230 | XP computation, embed generation, data consolidation |
| `messageUtils.js` | unchanged | Raw message fetching (already extracted) |
