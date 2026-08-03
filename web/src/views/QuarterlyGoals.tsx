import { useState } from "react";
import { api } from "../api";
import { useMutate, type Data } from "../useData";
import { Button, Card, Empty, Field, Notice, joinList, splitList } from "../ui";
import {
  AiPanel,
  AlignmentResult,
  ClarityResult,
  askAlignment,
  askClarity,
  useAi,
} from "../ai";
import { currentQuarter } from "../period";
import type { AlignmentVerdict, ClarityVerdict, QuarterlyGoal } from "../../../shared/types";

type Verdict = AlignmentVerdict | ClarityVerdict;
const isClarity = (v: Verdict): v is ClarityVerdict => "sharpenedTitle" in v;

const STATUSES = ["not-started", "in-progress", "completed"] as const;

export function QuarterlyGoals({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const { mutate, error, busy } = useMutate(reload);
  const ai = useAi<Verdict>();
  const [quarter, setQuarter] = useState(currentQuarter());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [alignedWith, setAlignedWith] = useState("");
  const [keyResults, setKeyResults] = useState("");

  const parentTitle = (id: string) =>
    data.longTermGoals.find((g) => g.id === id)?.title ?? "(missing)";

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const created = await mutate(() =>
      api.post("/quarterly-goals", {
        quarter,
        title,
        description,
        alignedWith,
        keyResults: splitList(keyResults),
      }),
    );
    if (created) {
      setTitle("");
      setDescription("");
      setKeyResults("");
    }
  }

  async function applyRewrite(goal: QuarterlyGoal, result: ClarityVerdict) {
    await mutate(() =>
      api.patch(`/quarterly-goals/${goal.id}`, {
        title: result.sharpenedTitle,
        description: result.sharpenedDescription,
        keyResults: result.successMetrics.length ? result.successMetrics : goal.keyResults,
      }),
    );
    ai.clear();
  }

  return (
    <section>
      <header className="view-head">
        <h2>Quarterly goals</h2>
        <p>One quarter of visible progress. Each must ladder up to a long-term goal.</p>
      </header>

      {error && <Notice>{error}</Notice>}

      {data.longTermGoals.length === 0 ? (
        <Notice kind="info">
          Add a long-term goal first — a quarterly goal has to move one of them forward.
        </Notice>
      ) : (
        <form className="form" onSubmit={add}>
          <Field label="Serves which long-term goal" required>
            <select value={alignedWith} onChange={(e) => setAlignedWith(e.target.value)} required>
              <option value="">Choose a long-term goal…</option>
              {data.longTermGoals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quarter" required hint="Format: 2026-Q3">
            <input
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
              pattern="\d{4}-Q[1-4]"
              required
            />
          </Field>
          <Field label="Title" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Draft the first three chapters"
              required
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </Field>
          <Field label="Key results" hint="Comma separated. OKR style.">
            <input
              value={keyResults}
              onChange={(e) => setKeyResults(e.target.value)}
              placeholder="15k words written, outline reviewed by two readers"
            />
          </Field>
          <Button type="submit" variant="primary" disabled={busy || !title.trim() || !alignedWith}>
            Add quarterly goal
          </Button>
        </form>
      )}

      {data.quarterlyGoals.length === 0 ? (
        <Empty>No quarterly goals yet.</Empty>
      ) : (
        <div className="list">
          {data.quarterlyGoals.map((goal) => (
            <Card key={goal.id}>
              <div className="card-head">
                <h3>
                  <span className="period">{goal.quarter}</span> {goal.title}
                </h3>
                <div className="card-actions">
                  <select
                    value={goal.status}
                    onChange={(e) =>
                      mutate(() =>
                        api.patch(`/quarterly-goals/${goal.id}`, { status: e.target.value }),
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
                    onClick={() => ai.run(goal.id, () => askAlignment("quarterly-goals", goal.id))}
                  >
                    Check alignment
                  </Button>
                  <Button onClick={() => ai.run(goal.id, () => askClarity("quarterly-goals", goal.id))}>
                    Sharpen
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => mutate(() => api.remove(`/quarterly-goals/${goal.id}`))}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              {goal.description && <p className="card-body">{goal.description}</p>}
              <p className="card-meta">
                serves <strong>{parentTitle(goal.alignedWith)}</strong>
                {goal.keyResults.length > 0 && ` · ${joinList(goal.keyResults)}`}
              </p>
              <AiPanel state={ai.state} id={goal.id} onClose={ai.clear}>
                {(result) =>
                  isClarity(result) ? (
                    <ClarityResult result={result} onApply={(r) => applyRewrite(goal, r)} />
                  ) : (
                    <AlignmentResult result={result} />
                  )
                }
              </AiPanel>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
