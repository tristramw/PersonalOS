# PersonalOS

A goal alignment system. Values at the top, today's tasks at the bottom, and an
honest answer to whether the two still agree.

```
VALUES              chosen, intentional
  ↓
LONG-TERM GOALS     2–5 years
  ↓
QUARTERLY GOALS     OKR style
  ↓
WEEKLY PRIORITIES   specific focus areas
  ↓
DAILY TASKS         what actually happened
```

The links are **enforced from long-term goals down through weekly priorities** —
you cannot create one of those without naming what it serves, and you cannot
delete something that still has children hanging off it. The link is
**optional on daily tasks**, so a day lost to meetings can still be recorded
honestly. That gap between what you planned and what you did is the point.

## Running it

```bash
npm install
cp .env.example .env    # add your Anthropic API key
npm run dev
```

Then open http://localhost:5173. The Vite dev server serves the UI and proxies
`/api` to the Express server on port 3001.

The app works fully without an API key — you just get a 503 from the three AI
features until you add one.

For a single-process production build:

```bash
npm run build && npm start   # serves UI + API on http://localhost:3001
```

## What Claude does

Three on-demand features, each behind a button. Nothing fires on a keystroke or
a timer, so cost stays in pennies rather than dollars.

| Feature | Where | What it does |
|---|---|---|
| **Check alignment** | Long-term, quarterly, weekly, daily | Walks the full chain from the root value down to the item, then judges whether it genuinely serves its parent. Returns strong / weak / none plus concrete suggestions. |
| **Sharpen** | Values, long-term, quarterly | Rewrites a vague goal so that a year from now you could tell without argument whether it happened. One click applies the rewrite. |
| **Guidance for this week** | Weekly | Given the active quarterly goals, proposes what belongs in this week and flags any goal getting no attention at all. One click adopts a suggestion as a priority. |

All three run server-side against `claude-opus-5` with adaptive thinking and
structured outputs. **The API key never reaches the browser** — that is the
reason this app has a backend rather than being a static page.

## Layout

```
web/           Vite + React UI
server/
  index.ts     Express app, error handling, static serving in production
  routes.ts    CRUD plus the hierarchy rules
  store.ts     the storage layer — two functions
  claude.ts    every Anthropic call
  http.ts      request validation helpers
shared/
  types.ts     the data model, used by both sides
data/          your goals, one JSON file per level. Gitignored.
```

### Storage

One JSON file per level, behind `read()` and `write()` in `server/store.ts`.
Writes are serialized per file and land via a temp-file rename, so a crash
mid-write leaves the previous version intact rather than a truncated one.

Moving to SQLite later means rewriting those two functions and nothing else.

**`data/` and `.env` are gitignored.** This repository is public; your values
and goals should not be in it.

## Not built yet

The journal system — freeform daily entries, mood and energy tags, and the
weekly/monthly/quarterly syntheses that surface values you haven't named yet.
That is phase two, and it feeds back into this one: patterns in the writing
become candidate values here.
