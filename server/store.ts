import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Collections, CollectionName } from "../shared/types";

/**
 * The storage layer. Deliberately two functions over one JSON file per
 * collection — swapping to SQLite later means rewriting this file and nothing
 * else. Keeping it JSON also means `data/` is readable and diffable by hand.
 */

const DATA_DIR = path.resolve(process.cwd(), "data");

const filePath = (name: CollectionName) => path.join(DATA_DIR, `${name}.json`);

/**
 * Writes to the same file are serialized. Without this, two requests can each
 * read, then each write, and the second silently discards the first's record.
 */
const writeQueues = new Map<CollectionName, Promise<unknown>>();

export async function read<K extends CollectionName>(
  name: K,
): Promise<Collections[K][]> {
  try {
    const raw = await readFile(filePath(name), "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`${name}.json does not contain an array`);
    }
    return parsed as Collections[K][];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function write<K extends CollectionName>(
  name: K,
  items: Collections[K][],
): Promise<void> {
  const run = (writeQueues.get(name) ?? Promise.resolve()).then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    // Write to a sibling temp file and rename over the target, so a crash
    // mid-write leaves the previous version intact rather than a truncated one.
    const target = filePath(name);
    const temp = `${target}.tmp`;
    await writeFile(temp, JSON.stringify(items, null, 2) + "\n", "utf8");
    await rename(temp, target);
  });

  // Keep the chain alive even if this write fails, so one error does not wedge
  // every subsequent write to the same collection.
  writeQueues.set(
    name,
    run.catch(() => {}),
  );
  return run;
}

export const newId = () => crypto.randomUUID();
