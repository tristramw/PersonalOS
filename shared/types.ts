/**
 * The goal hierarchy. Each level names the one above it via `alignedWith`.
 *
 * Values → Long-term goals → Quarterly goals → Weekly priorities → Daily tasks
 *
 * The link is REQUIRED from long-term goals down through weekly priorities, so
 * the structural spine always holds. It is OPTIONAL on daily tasks, so a day
 * spent on meetings and fire-fighting can still be recorded honestly — that
 * gap between plan and reality is exactly the signal worth looking at later.
 */

export type Status = "not-started" | "in-progress" | "completed";
export type GoalStatus = "active" | "archived";

/** A chosen principle. The root of the tree — nothing sits above it. */
export interface Value {
  id: string;
  name: string;
  /** Why this matters to you. The AI leans on this when judging alignment. */
  description: string;
  definedAt: string;
}

/** A 2–5 year ambition. Must serve a value. */
export interface LongTermGoal {
  id: string;
  title: string;
  description: string;
  /** Value id. Required. */
  alignedWith: string;
  timeframe: string;
  successMetrics: string[];
  status: GoalStatus;
  createdAt: string;
}

/** A quarter's worth of progress toward a long-term goal. */
export interface QuarterlyGoal {
  id: string;
  /** e.g. "2026-Q3" */
  quarter: string;
  title: string;
  description: string;
  /** LongTermGoal id. Required. */
  alignedWith: string;
  keyResults: string[];
  status: Status;
  createdAt: string;
}

/** A focus area for one week. Must ladder up to a quarterly goal. */
export interface WeeklyPriority {
  id: string;
  /** ISO week, e.g. "2026-W31" */
  week: string;
  title: string;
  /** QuarterlyGoal id. Required. */
  alignedWith: string;
  /** Your own words on why this matters this week. */
  reasoning: string;
  status: Status;
  createdAt: string;
}

/** How a week actually went. One per week, optional. */
export interface WeeklyReflection {
  id: string;
  week: string;
  text: string;
  createdAt: string;
}

/** A unit of work on a given day. */
export interface DailyTask {
  id: string;
  /** "2026-08-03" */
  date: string;
  title: string;
  description: string;
  tags: string[];
  /** WeeklyPriority id, or null when the work serves no stated priority. */
  alignedWith: string | null;
  status: Status;
  /** Minutes. */
  timeEstimate: number | null;
  actualTime: number | null;
  reflection: string;
  createdAt: string;
}

/** Maps each collection name to the record it holds. */
export interface Collections {
  values: Value;
  "long-term-goals": LongTermGoal;
  "quarterly-goals": QuarterlyGoal;
  "weekly-priorities": WeeklyPriority;
  "weekly-reflections": WeeklyReflection;
  "daily-tasks": DailyTask;
}

export type CollectionName = keyof Collections;

// ---------------------------------------------------------------------------
// AI responses
// ---------------------------------------------------------------------------

export interface AlignmentVerdict {
  /** "strong" | "weak" | "none" — how well the item serves its parent. */
  alignment: "strong" | "weak" | "none";
  reasoning: string;
  /** Concrete suggestions, empty when alignment is strong. */
  suggestions: string[];
}

export interface ClarityVerdict {
  /** A tighter rewrite of the title. */
  sharpenedTitle: string;
  sharpenedDescription: string;
  /** Observable, checkable measures of success. */
  successMetrics: string[];
  /** What was vague about the original. */
  critique: string;
}

export interface WeeklyGuidance {
  /** Kinds of work that would serve the quarter this week. */
  suggestedFocus: { title: string; rationale: string; quarterlyGoalId: string }[];
  /** Quarterly goals getting no weekly attention at all. */
  neglectedGoals: { quarterlyGoalId: string; note: string }[];
  summary: string;
}
