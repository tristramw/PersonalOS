import { useState } from "react";
import { api } from "../api";
import { useMutate, type Data } from "../useData";
import { Button, Card, Empty, Field, Notice, StatusBadge, joinList, splitList } from "../ui";
import {
  AiPanel,
  AlignmentResult,
  ClarityResult,
  askAlignment,
  askClarity,
  useAi,
} from "../ai";
import type { AlignmentVerdict, ClarityVerdict, LongTermGoal } from "../../../shared/types";

type Verdict = AlignmentVerdict | ClarityVerdict;
const isClarity = (v: Verdict): v is ClarityVerdict => "sharpenedTitle" in v;

export function LongTermGoals({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const { mutate, error, busy } = useMutate(reload);
  const ai = useAi<Verdict>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [alignedWith, setAlignedWith] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [metrics, setMetrics] = useState("");

  const valueName = (id: string) => data.values.find((v) => v.id === id)?.name ?? "(missing)";

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const created = await mutate(() =>
      api.post("/long-term-goals", {
        title,
        description,
        alignedWith,
        timeframe,
        successMetrics: splitList(metrics),
      }),
    );
    if (created) {
      setTitle("");
      setDescription("");
      setTimeframe("");
      setMetrics("");
    }
  }

  async function applyRewrite(goal: LongTermGoal, result: ClarityVerdict) {
    await mutate(() =>
      api.patch(`/long-term-goals/${goal.id}`, {
        title: result.sharpenedTitle,
        description: result.sharpenedDescription,
        successMetrics: result.successMetrics.length ? result.successMetrics : goal.successMetrics,
      }),
    );
    ai.clear();
  }

  return (
    <section>
      <header className="view-head">
        <h2>Long-term goals</h2>
        <p>Two to five years out. Each one must serve a value — that link is required.</p>
      </header>

      {error && <Notice>{error}</Notice>}

      {data.values.length === 0 ? (
        <Notice kind="info">
          Define at least one value first. A long-term goal has to serve something, and the
          hierarchy is enforced from here down to weekly priorities.
        </Notice>
      ) : (
        <form className="form" onSubmit={add}>
          <Field label="Serves which value" required>
            <select value={alignedWith} onChange={(e) => setAlignedWith(e.target.value)} required>
              <option value="">Choose a value…</option>
              {data.values.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Title" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Publish a book on focused work"
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
          <Field label="Timeframe">
            <input
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              placeholder="2 years"
            />
          </Field>
          <Field label="Success metrics" hint="Comma separated.">
            <input
              value={metrics}
              onChange={(e) => setMetrics(e.target.value)}
              placeholder="Manuscript accepted, 10k copies sold"
            />
          </Field>
          <Button type="submit" variant="primary" disabled={busy || !title.trim() || !alignedWith}>
            Add long-term goal
          </Button>
        </form>
      )}

      {data.longTermGoals.length === 0 ? (
        <Empty>No long-term goals yet.</Empty>
      ) : (
        <div className="list">
          {data.longTermGoals.map((goal) => (
            <Card key={goal.id}>
              <div className="card-head">
                <h3>{goal.title}</h3>
                <div className="card-actions">
                  <StatusBadge status={goal.status} />
                  <Button
                    onClick={() => ai.run(goal.id, () => askAlignment("long-term-goals", goal.id))}
                  >
                    Check alignment
                  </Button>
                  <Button onClick={() => ai.run(goal.id, () => askClarity("long-term-goals", goal.id))}>
                    Sharpen
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => mutate(() => api.remove(`/long-term-goals/${goal.id}`))}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              {goal.description && <p className="card-body">{goal.description}</p>}
              <p className="card-meta">
                serves <strong>{valueName(goal.alignedWith)}</strong>
                {goal.timeframe && ` · ${goal.timeframe}`}
                {goal.successMetrics.length > 0 && ` · ${joinList(goal.successMetrics)}`}
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
