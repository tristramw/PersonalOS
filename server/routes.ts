import { Router } from "express";
import { read, write, newId } from "./store";
import {
  HttpError,
  requireString,
  optionalString,
  stringArray,
  optionalNumber,
  oneOf,
  matching,
  QUARTER,
  WEEK,
  DATE,
} from "./http";
import type { Collections, CollectionName } from "../shared/types";

type Body = Record<string, unknown>;

const STATUS = ["not-started", "in-progress", "completed"] as const;
const GOAL_STATUS = ["active", "archived"] as const;

/** Rejects a link whose target does not exist, so the spine can't be broken. */
async function requireParent(
  collection: CollectionName,
  id: string,
  label: string,
): Promise<void> {
  const items = await read(collection);
  if (!items.some((item) => item.id === id)) {
    throw new HttpError(400, `No ${label} exists with id "${id}"`);
  }
}

interface Resource<K extends CollectionName> {
  name: K;
  /** Builds a complete record. `prev` is null on create, the existing one on edit. */
  build(body: Body, prev: Collections[K] | null): Promise<Collections[K]>;
  /** Collections holding an `alignedWith` pointing at this one. */
  childCollections: { collection: CollectionName; label: string }[];
}

const resources: { [K in CollectionName]: Resource<K> } = {
  values: {
    name: "values",
    childCollections: [{ collection: "long-term-goals", label: "long-term goal" }],
    async build(body, prev) {
      return {
        id: prev?.id ?? newId(),
        name: requireString(body, "name"),
        description: optionalString(body, "description"),
        definedAt: prev?.definedAt ?? new Date().toISOString(),
      };
    },
  },

  "long-term-goals": {
    name: "long-term-goals",
    childCollections: [{ collection: "quarterly-goals", label: "quarterly goal" }],
    async build(body, prev) {
      const alignedWith = requireString(body, "alignedWith");
      await requireParent("values", alignedWith, "value");
      return {
        id: prev?.id ?? newId(),
        title: requireString(body, "title"),
        description: optionalString(body, "description"),
        alignedWith,
        timeframe: optionalString(body, "timeframe"),
        successMetrics: stringArray(body, "successMetrics"),
        status: oneOf(body, "status", GOAL_STATUS, "active"),
        createdAt: prev?.createdAt ?? new Date().toISOString(),
      };
    },
  },

  "quarterly-goals": {
    name: "quarterly-goals",
    childCollections: [{ collection: "weekly-priorities", label: "weekly priority" }],
    async build(body, prev) {
      const alignedWith = requireString(body, "alignedWith");
      await requireParent("long-term-goals", alignedWith, "long-term goal");
      return {
        id: prev?.id ?? newId(),
        quarter: matching(body, "quarter", QUARTER, "2026-Q3"),
        title: requireString(body, "title"),
        description: optionalString(body, "description"),
        alignedWith,
        keyResults: stringArray(body, "keyResults"),
        status: oneOf(body, "status", STATUS, "not-started"),
        createdAt: prev?.createdAt ?? new Date().toISOString(),
      };
    },
  },

  "weekly-priorities": {
    name: "weekly-priorities",
    childCollections: [{ collection: "daily-tasks", label: "daily task" }],
    async build(body, prev) {
      const alignedWith = requireString(body, "alignedWith");
      await requireParent("quarterly-goals", alignedWith, "quarterly goal");
      return {
        id: prev?.id ?? newId(),
        week: matching(body, "week", WEEK, "2026-W31"),
        title: requireString(body, "title"),
        alignedWith,
        reasoning: optionalString(body, "reasoning"),
        status: oneOf(body, "status", STATUS, "not-started"),
        createdAt: prev?.createdAt ?? new Date().toISOString(),
      };
    },
  },

  "weekly-reflections": {
    name: "weekly-reflections",
    childCollections: [],
    async build(body, prev) {
      return {
        id: prev?.id ?? newId(),
        week: matching(body, "week", WEEK, "2026-W31"),
        text: requireString(body, "text"),
        createdAt: prev?.createdAt ?? new Date().toISOString(),
      };
    },
  },

  "daily-tasks": {
    name: "daily-tasks",
    childCollections: [],
    async build(body, prev) {
      // The one optional link in the tree. A task with no weekly priority is
      // valid and worth recording — it is the raw material for spotting drift.
      const raw = body["alignedWith"];
      const alignedWith = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
      if (alignedWith) {
        await requireParent("weekly-priorities", alignedWith, "weekly priority");
      }
      return {
        id: prev?.id ?? newId(),
        date: matching(body, "date", DATE, "2026-08-03"),
        title: requireString(body, "title"),
        description: optionalString(body, "description"),
        tags: stringArray(body, "tags"),
        alignedWith,
        status: oneOf(body, "status", STATUS, "not-started"),
        timeEstimate: optionalNumber(body, "timeEstimate"),
        actualTime: optionalNumber(body, "actualTime"),
        reflection: optionalString(body, "reflection"),
        createdAt: prev?.createdAt ?? new Date().toISOString(),
      };
    },
  },
};

function mount<K extends CollectionName>(router: Router, resource: Resource<K>): void {
  const base = `/${resource.name}`;

  router.get(base, async (_req, res) => {
    res.json(await read(resource.name));
  });

  router.post(base, async (req, res) => {
    const record = await resource.build(req.body ?? {}, null);
    const items = await read(resource.name);
    await write(resource.name, [...items, record]);
    res.status(201).json(record);
  });

  router.patch(`${base}/:id`, async (req, res) => {
    const items = await read(resource.name);
    const index = items.findIndex((item) => item.id === req.params.id);
    if (index === -1) throw new HttpError(404, "Not found");
    // Merge over the existing record, then re-validate the whole thing — a
    // partial edit can't sneak past the rules that applied on create.
    const merged = { ...items[index], ...(req.body ?? {}) } as Body;
    const record = await resource.build(merged, items[index]);
    items[index] = record;
    await write(resource.name, items);
    res.json(record);
  });

  router.delete(`${base}/:id`, async (req, res) => {
    const id = req.params.id;
    for (const { collection, label } of resource.childCollections) {
      const children = await read(collection);
      const count = children.filter(
        (child) => (child as { alignedWith?: string | null }).alignedWith === id,
      ).length;
      if (count > 0) {
        throw new HttpError(
          409,
          `Still linked to ${count} ${label}${count === 1 ? "" : "s"}. ` +
            `Move or delete ${count === 1 ? "it" : "them"} first.`,
        );
      }
    }
    const items = await read(resource.name);
    const remaining = items.filter((item) => item.id !== id);
    if (remaining.length === items.length) throw new HttpError(404, "Not found");
    await write(resource.name, remaining);
    res.status(204).end();
  });
}

export function buildRoutes(): Router {
  const router = Router();
  for (const resource of Object.values(resources) as Resource<CollectionName>[]) {
    mount(router, resource);
  }
  return router;
}
