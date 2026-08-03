import { useState } from "react";
import { api } from "../api";
import { useMutate, type Data } from "../useData";
import { Button, Card, Empty, Field, Notice } from "../ui";
import {
  AiPanel,
  AlignmentResult,
  GuidanceResult,
  askAlignment,
  askWeeklyGuidance,
  useAi,
} from "../ai";
import { currentWeek } from "../period";
import type { AlignmentVerdict, WeeklyGuidance } from "../../../shared/types";

const STATUSES = ["not-started", "in-progress", "completed"] as const;

export function WeeklyPriorities({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const { mutate, error, busy } = useMutate(reload);
  const alignment = useAi<AlignmentVerdict>();
  const guidance = useAi<WeeklyGuidance>();

  const [week, setWeek] = useState(currentWeek());
  const [title, setTitle] = useState("");
  const [alignedWith, setAlignedWith] = useState("");
  const [reasoning, setReasoning] = useState("");

  const goalTitle = (id: string) =>
    data.quarterlyGoals.find((g) => g.id === id)?.title ?? "(unknown goal)";

  const thisWeek = data.weeklyPriorities.filter((p) => p.week === week);
  const reflection = data.weeklyReflections.find((r) => r.week === week);
  const [reflectionText, setReflectionText] = useState("");

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const created = await mutate(() =>
      api.post("/weekly-priorities", { week, title, alignedWith, reasoning }),
    );
    if (created) {
      setTitle("");
      setReasoning("");
    }
  }

  async function adopt(suggestedTitle: string, quarterlyGoalId: string, rationale: string) {
    await mutate(() =>
      api.post("/weekly-priorities", {
        week,
        title: suggestedTitle,
        alignedWith: quarterlyGoalId,
        reasoning: rationale,
      }),
    );
  }

  async function saveReflection() {
    const text = reflectionText.trim();
    if (!text) return;
    const saved = await mutate(() =>
      reflection
        ? api.patch(`/weekly-reflections/${reflection.id}`, { text })
        : api.post("/weekly-reflections", { week, text }),
    );
    if (saved) setReflectionText("");
  }

  return (
    <section>
      <header className="view-head">
        <h2>Weekly priorities</h2>
        <p>
          The last enforced level. Every priority must serve a quarterly goal — below this,
          daily tasks are free to float.
        </p>
      </header>

      {error && <Notice>{error}</Notice>}

      <div className="toolbar">
        <Field label="Week" hint="Format: 2026-W31">
          <input
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            pattern="\d{4}-W\d{2}"
          />
        </Field>
        <Button
          variant="primary"
          onClick={() => guidance.run(week, () => askWeeklyGuidance(week))}
          title="Ask Claude what kinds of work belong in this week"
        >
          Guidance for this week
        </Button>
      </div>

      <AiPanel state={guidance.state} id={week} onClose={guidance.clear}>
        {(result) => (
          <GuidanceResult result={result} goalTitle={goalTitle} onAdopt={adopt} />
        )}
      </AiPanel>

      {data.quarterlyGoals.length === 0 ? (
        <Notice kind="info">
          Add a quarterly goal first — a weekly priority has to move one of them forward.
        </Notice>
      ) : (
        <form className="form" onSubmit={add}>
          <Field label="Serves which quarterly goal" required>
            <select value={alignedWith} onChange={(e) => setAlignedWith(e.target.value)} required>
              <option value="">Choose a quarterly goal…</option>
              {data.quarterlyGoals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.quarter} — {goal.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Title" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Two uninterrupted mornings on chapter two"
              required
            />
          </Field>
          <Field label="Why this, this week">
            <textarea
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              rows={2}
            />
          </Field>
          <Button type="submit" variant="primary" disabled={busy || !title.trim() || !alignedWith}>
            Add priority
          </Button>
        </form>
      )}

      {thisWeek.length === 0 ? (
        <Empty>Nothing planned for {week}.</Empty>
      ) : (
        <div className="list">
          {thisWeek.map((priority) => (
            <Card key={priority.id}>
              <div className="card-head">
                <h3>{priority.title}</h3>
                <div className="card-actions">
                  <select
                    value={priority.status}
                    onChange={(e) =>
                      mutate(() =>
                        api.patch(`/weekly-priorities/${priority.id}`, { status: e.target.value }),
                      )
                    }
                    aria-label="Status"
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status.replace("-", " ")}
                      </option>
                    ))}
                  </select>
                  <Button
                    onClick={() =>
                      alignment.run(priority.id, () =>
                        askAlignment("weekly-priorities", priority.id),
                      )
                    }
                  >
                    Check alignment
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => mutate(() => api.remove(`/weekly-priorities/${priority.id}`))}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              {priority.reasoning && <p className="card-body">{priority.reasoning}</p>}
              <p className="card-meta">
                serves <strong>{goalTitle(priority.alignedWith)}</strong>
              </p>
              <AiPanel state={alignment.state} id={priority.id} onClose={alignment.clear}>
                {(result) => <AlignmentResult result={result} />}
              </AiPanel>
            </Card>
          ))}
        </div>
      )}

      <div className="reflection">
        <h3>How did {week} go?</h3>
        {reflection && <p className="card-body">{reflection.text}</p>}
        <textarea
          value={reflectionText}
          onChange={(e) => setReflectionText(e.target.value)}
          rows={3}
          placeholder={
            reflection
              ? "Replace the reflection above…"
              : "What actually happened, versus what you planned?"
          }
        />
        <Button variant="primary" onClick={saveReflection} disabled={busy || !reflectionText.trim()}>
          {reflection ? "Replace reflection" : "Save reflection"}
        </Button>
      </div>
    </section>
  );
}
