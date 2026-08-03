import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";
import { read } from "./store";
import { HttpError, requireString, matching, WEEK } from "./http";
import type { CollectionName } from "../shared/types";

/**
 * Every Claude call happens here, server-side. The API key must never reach
 * the browser, which is the whole reason this app has a backend at all.
 *
 * All three features are on-demand — triggered by a button, never on a
 * keystroke or a timer. At this volume that is pennies, not dollars.
 */

const MODEL = "claude-opus-5";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new HttpError(
      503,
      "No ANTHROPIC_API_KEY set. Copy .env.example to .env and add your key, " +
        "then restart the server. Everything else in the app works without it.",
    );
  }
  client ??= new Anthropic();
  return client;
}

const SYSTEM = `You help someone keep their daily work honestly connected to what they actually care about.

Their goals are arranged in a hierarchy: values → long-term goals → quarterly goals → weekly priorities → daily tasks. Each level is supposed to serve the one above it.

Be a rigorous critic, not a cheerleader. A weak connection stated plainly is far more useful to them than a generous reading. If something genuinely does not serve its parent, say so directly and explain what is missing. If it does, say that plainly too and do not manufacture criticism.

Judge what is written, not what you imagine they meant. If a goal is too vague to evaluate, that vagueness is itself the finding.

Keep every field brief and specific. No preamble, no restating their input back to them, no hedging language. Prefer two sharp sentences over a paragraph.`;

/** JSON Schema requires additionalProperties:false on every object. */
const alignmentSchema = {
  type: "object",
  properties: {
    alignment: {
      type: "string",
      enum: ["strong", "weak", "none"],
      description: "How well this item serves the one above it.",
    },
    reasoning: {
      type: "string",
      description: "Two or three sentences explaining the verdict.",
    },
    suggestions: {
      type: "array",
      items: { type: "string" },
      description:
        "Concrete rewordings or changes that would strengthen the link. Empty when alignment is strong.",
    },
  },
  required: ["alignment", "reasoning", "suggestions"],
  additionalProperties: false,
};

const claritySchema = {
  type: "object",
  properties: {
    sharpenedTitle: { type: "string", description: "A tighter, more specific title." },
    sharpenedDescription: { type: "string", description: "A tighter description." },
    successMetrics: {
      type: "array",
      items: { type: "string" },
      description: "Observable, checkable measures. Someone else should be able to verify each one.",
    },
    critique: { type: "string", description: "What was vague about the original, in one or two sentences." },
  },
  required: ["sharpenedTitle", "sharpenedDescription", "successMetrics", "critique"],
  additionalProperties: false,
};

const guidanceSchema = {
  type: "object",
  properties: {
    suggestedFocus: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "A candidate weekly priority." },
          rationale: { type: "string", description: "Why this week, in one sentence." },
          quarterlyGoalId: { type: "string", description: "The id of the quarterly goal it serves." },
        },
        required: ["title", "rationale", "quarterlyGoalId"],
        additionalProperties: false,
      },
    },
    neglectedGoals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          quarterlyGoalId: { type: "string" },
          note: { type: "string", description: "Why the neglect matters, in one sentence." },
        },
        required: ["quarterlyGoalId", "note"],
        additionalProperties: false,
      },
    },
    summary: { type: "string", description: "Two or three sentences on where the week should land." },
  },
  required: ["suggestedFocus", "neglectedGoals", "summary"],
  additionalProperties: false,
};

async function ask<T>(prompt: string, schema: Record<string, unknown>): Promise<T> {
  const response = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: prompt }],
  });

  // Check why generation stopped before trusting the content.
  if (response.stop_reason === "refusal") {
    throw new HttpError(422, "Claude declined to answer this one.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new HttpError(502, "Claude's response was cut off. Try again.");
  }

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new HttpError(502, "Claude returned no text content.");
  }
  return JSON.parse(block.text) as T;
}

// ---------------------------------------------------------------------------
// Walking the hierarchy
// ---------------------------------------------------------------------------

const PARENT_OF: Partial<Record<CollectionName, CollectionName>> = {
  "long-term-goals": "values",
  "quarterly-goals": "long-term-goals",
  "weekly-priorities": "quarterly-goals",
  "daily-tasks": "weekly-priorities",
};

const LABEL: Record<string, string> = {
  values: "Value",
  "long-term-goals": "Long-term goal",
  "quarterly-goals": "Quarterly goal",
  "weekly-priorities": "Weekly priority",
  "daily-tasks": "Daily task",
};

type AnyRecord = Record<string, unknown> & { id: string; alignedWith?: string | null };

async function findOne(collection: CollectionName, id: string): Promise<AnyRecord> {
  const items = (await read(collection)) as unknown as AnyRecord[];
  const found = items.find((item) => item.id === id);
  if (!found) throw new HttpError(404, `No ${LABEL[collection] ?? collection} with id "${id}"`);
  return found;
}

/**
 * Returns the full ladder from the root value down to the given item. Showing
 * Claude the whole chain is the point — judging a weekly priority against its
 * quarterly goal alone misses whether that goal still serves the value.
 */
async function chainTo(
  collection: CollectionName,
  id: string,
): Promise<{ collection: CollectionName; record: AnyRecord }[]> {
  const chain: { collection: CollectionName; record: AnyRecord }[] = [];
  let currentCollection: CollectionName | undefined = collection;
  let currentId: string | null = id;

  while (currentCollection && currentId) {
    const record: AnyRecord = await findOne(currentCollection, currentId);
    chain.unshift({ collection: currentCollection, record });
    currentId = typeof record.alignedWith === "string" ? record.alignedWith : null;
    currentCollection = PARENT_OF[currentCollection];
  }
  return chain;
}

function describe(collection: CollectionName, record: AnyRecord): string {
  const skip = new Set(["id", "alignedWith", "createdAt", "definedAt"]);
  const lines = Object.entries(record)
    .filter(([key, value]) => !skip.has(key) && value !== null && value !== "")
    .map(([key, value]) => `  ${key}: ${Array.isArray(value) ? value.join("; ") : String(value)}`)
    .filter((line) => !line.endsWith(": "));
  return `${LABEL[collection] ?? collection}:\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const CHECKABLE: CollectionName[] = [
  "long-term-goals",
  "quarterly-goals",
  "weekly-priorities",
  "daily-tasks",
];

const SHARPENABLE: CollectionName[] = [
  "values",
  "long-term-goals",
  "quarterly-goals",
  "weekly-priorities",
];

function collectionFrom(body: Record<string, unknown>, allowed: CollectionName[]): CollectionName {
  const value = requireString(body, "collection");
  if (!allowed.includes(value as CollectionName)) {
    throw new HttpError(400, `"collection" must be one of: ${allowed.join(", ")}`);
  }
  return value as CollectionName;
}

export function buildAiRoutes(): Router {
  const router = Router();

  router.get("/ai/status", (_req, res) => {
    res.json({ configured: Boolean(process.env.ANTHROPIC_API_KEY), model: MODEL });
  });

  /** Does this item actually serve the one above it? */
  router.post("/ai/alignment", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const collection = collectionFrom(body, CHECKABLE);
    const id = requireString(body, "id");

    const chain = await chainTo(collection, id);
    if (chain.length < 2) {
      throw new HttpError(
        400,
        "This item is not linked to anything above it, so there is no alignment to check.",
      );
    }

    const target = chain[chain.length - 1];
    const prompt = `Here is one branch of the hierarchy, from the root value down:

${chain.map(({ collection: c, record }) => describe(c, record)).join("\n\n")}

Judge the bottom item — the ${LABEL[target.collection].toLowerCase()} — against the ${LABEL[
      chain[chain.length - 2].collection
    ].toLowerCase()} directly above it. Use the higher levels as context for whether that parent is itself worth serving.`;

    res.json(await ask(prompt, alignmentSchema));
  });

  /** Take something vague and make it checkable. */
  router.post("/ai/clarity", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const collection = collectionFrom(body, SHARPENABLE);
    const id = requireString(body, "id");

    const chain = await chainTo(collection, id);
    const target = chain[chain.length - 1];
    const context =
      chain.length > 1
        ? `\n\nFor context, here is what sits above it:\n\n${chain
            .slice(0, -1)
            .map(({ collection: c, record }) => describe(c, record))
            .join("\n\n")}`
        : "";

    const prompt = `Sharpen this ${LABEL[target.collection].toLowerCase()}:

${describe(target.collection, target.record)}${context}

Rewrite it so that a year from now they could tell without argument whether it happened. Keep their intent and their voice — you are tightening their words, not replacing their ambition with a different one.`;

    res.json(await ask(prompt, claritySchema));
  });

  /** Given the quarter, what kinds of work belong in this week? */
  router.post("/ai/weekly-guidance", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const week = matching(body, "week", WEEK, "2026-W31");

    const [quarterlyGoals, longTermGoals, values, priorities] = await Promise.all([
      read("quarterly-goals"),
      read("long-term-goals"),
      read("values"),
      read("weekly-priorities"),
    ]);

    const active = quarterlyGoals.filter((goal) => goal.status !== "completed");
    if (active.length === 0) {
      throw new HttpError(
        400,
        "No active quarterly goals to plan against. Add one before asking for weekly guidance.",
      );
    }

    const valueName = (id: string) => values.find((v) => v.id === id)?.name ?? "(unknown)";
    const goalContext = active
      .map((goal) => {
        const parent = longTermGoals.find((g) => g.id === goal.alignedWith);
        return [
          `Quarterly goal (id: ${goal.id})`,
          `  quarter: ${goal.quarter}`,
          `  title: ${goal.title}`,
          goal.description ? `  description: ${goal.description}` : "",
          goal.keyResults.length ? `  key results: ${goal.keyResults.join("; ")}` : "",
          `  status: ${goal.status}`,
          parent ? `  serves long-term goal: ${parent.title}` : "",
          parent ? `  which serves value: ${valueName(parent.alignedWith)}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");

    const thisWeek = priorities.filter((p) => p.week === week);
    const alreadyPlanned = thisWeek.length
      ? thisWeek
          .map((p) => `- ${p.title} (serves quarterly goal id: ${p.alignedWith}, ${p.status})`)
          .join("\n")
      : "(nothing planned yet)";

    const prompt = `Planning week ${week}.

Active quarterly goals:

${goalContext}

Already planned for this week:
${alreadyPlanned}

Suggest weekly priorities that would move these quarterly goals forward, and flag any goal getting no attention this week. Every quarterlyGoalId you return must be one of the ids listed above. Do not repeat something already planned. Suggest at most four — a week has limited room, and a list that ignores that is useless.`;

    res.json(await ask(prompt, guidanceSchema));
  });

  return router;
}
