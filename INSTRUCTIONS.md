# INSTRUCTIONS — read this first

**Any new session (new chat, new agent, fresh context) must read this file before writing
code.** It explains how this project is built and how to find out what is already done.

---

## 1. Figure out where the project stands

Do this before anything else, in this order:

1. Read `docs/ROADMAP.md` — the phase table with a status column is the authoritative index.
2. List `docs/progress/` — one `PHASE-XX-COMPLETE.md` file exists for **every finished
   phase**. The highest-numbered file is the last completed phase.
3. Read the most recent `PHASE-XX-COMPLETE.md` — it records what was built, decisions made,
   deviations from spec, known gaps, and how to verify it still works.
4. Read `docs/phases/phase-YY-*.md` for the **next** phase (YY = XX + 1). That is your scope.

If `docs/progress/` is empty, no phase is finished; start at Phase 1.

Never guess progress from the file tree alone — a directory can exist and be empty, or
contain a half-finished spike.

---

## 2. Rules that apply to every phase

- **Work one phase at a time.** Do not start phase N+1 until phase N's Exit check passes and
  its completion file is written. If a later phase's feature looks easy, still don't build it.
- **`shared/src/protocol.ts` is the single source of truth** for the wire format. Neither app
  invents fields. Changing the protocol means bumping `PROTOCOL_VERSION` and updating both
  sides in the same phase.
- **TypeScript everywhere** on the JS layers (`android-app/`, `mac-app/`). Kotlin only for
  Android native modules. `strict` stays on.
- **Every phase leaves the repo runnable.** No commented-out broken code, no TODO stubs that
  crash at runtime.
- **LAN-only, always.** No cloud, no relay, no external server. "Disconnected" is a valid,
  expected resting state — never add a fallback that phones home.
- **Never silently skip a constraint.** `docs/CONSTRAINTS.md` lists five accepted limitations.
  If you hit one, surface it in the UI and in your report to the user. Do not work around it
  quietly.
- **No custom crypto.** Phase 5 uses `tweetnacl`. Nothing hand-rolled.
- **Ask before scope changes.** If a phase spec turns out to be wrong or impossible, say so
  and propose an amendment — don't reinterpret it alone.

---

## 3. When you finish a phase

A phase is done when **all** of these are true:

1. Every deliverable in `docs/phases/phase-XX-*.md` exists and works.
2. The **Exit check** in that spec has actually been run, on real devices where the spec says
   so. Report the real result — if it half-works, it is not done.
3. `docs/progress/PHASE-XX-COMPLETE.md` is written (template below).
4. The status column in `docs/ROADMAP.md` is flipped to ✅ for that row.
5. The "Status" line in `README.md` names the newly completed phase.
6. Work is committed with the message `phase XX: <short summary>`.

### Completion file template

Copy this into `docs/progress/PHASE-XX-COMPLETE.md`:

```markdown
# Phase XX — <Name> — COMPLETE

**Completed:** YYYY-MM-DD

## What was built
- <file/module> — <what it does>

## Exit check result
<The check from the phase spec, verbatim, and what actually happened when it was run.
State the environment: which Android version/device, which macOS version.>

## Decisions made
- <decision> — <why>

## Deviations from the phase spec
- <what differs and why> (or "None")

## Known gaps carried forward
- <anything deliberately left for a later phase, and which phase owns it> (or "None")

## How to re-verify
```bash
<exact commands a future session can run to confirm this phase still works>
```

## Next phase
Phase <XX+1> — see `docs/phases/phase-<XX+1>-*.md`
```

Be honest in these files. A future session trusts them completely and will not re-verify your
claims. An overstated completion file is worse than no file.

---

## 4. Repo layout

```
phonelink-clone/
├── INSTRUCTIONS.md      # this file — read first
├── README.md            # project overview + current status line
├── shared/              # protocol types + runtime validators (both apps import this)
├── android-app/         # React Native, bare workflow (native Kotlin modules required)
├── mac-app/             # Electron, tray-only UI
└── docs/
    ├── ROADMAP.md       # phase table, authoritative status index
    ├── CONSTRAINTS.md   # five accepted limitations — never silently bypass
    ├── phases/          # one spec per phase, each with an Exit check
    └── progress/        # one PHASE-XX-COMPLETE.md per finished phase
```
