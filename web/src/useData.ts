import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type {
  Value,
  LongTermGoal,
  QuarterlyGoal,
  WeeklyPriority,
  WeeklyReflection,
  DailyTask,
} from "../../shared/types";

export interface Data {
  values: Value[];
  longTermGoals: LongTermGoal[];
  quarterlyGoals: QuarterlyGoal[];
  weeklyPriorities: WeeklyPriority[];
  weeklyReflections: WeeklyReflection[];
  dailyTasks: DailyTask[];
}

const EMPTY: Data = {
  values: [],
  longTermGoals: [],
  quarterlyGoals: [],
  weeklyPriorities: [],
  weeklyReflections: [],
  dailyTasks: [],
};

/**
 * Loads the whole tree in one go. It is one person's goals — a few hundred
 * records at most — so per-view fetching would add plumbing and save nothing,
 * and every view needs to look up names from levels above it anyway.
 */
export function useData() {
  const [data, setData] = useState<Data>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [
        values,
        longTermGoals,
        quarterlyGoals,
        weeklyPriorities,
        weeklyReflections,
        dailyTasks,
      ] = await Promise.all([
        api.get<Value[]>("/values"),
        api.get<LongTermGoal[]>("/long-term-goals"),
        api.get<QuarterlyGoal[]>("/quarterly-goals"),
        api.get<WeeklyPriority[]>("/weekly-priorities"),
        api.get<WeeklyReflection[]>("/weekly-reflections"),
        api.get<DailyTask[]>("/daily-tasks"),
      ]);
      setData({
        values,
        longTermGoals,
        quarterlyGoals,
        weeklyPriorities,
        weeklyReflections,
        dailyTasks,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}

/**
 * Runs a write, surfaces its message on failure, and refreshes on success.
 * Server-side rejections (a missing parent, a delete that would orphan
 * children) are the useful ones — they get shown verbatim rather than
 * flattened into "something went wrong".
 */
export function useMutate(reload: () => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mutate = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      setBusy(true);
      try {
        await action();
        setError(null);
        await reload();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "The change could not be saved");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  return { mutate, error, busy, clearError: () => setError(null) };
}
