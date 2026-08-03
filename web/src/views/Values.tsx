import { useState } from "react";
import { api } from "../api";
import { useMutate, type Data } from "../useData";
import { Button, Card, Empty, Field, Notice } from "../ui";
import { AiPanel, ClarityResult, askClarity, useAi } from "../ai";
import type { ClarityVerdict, Value } from "../../../shared/types";

export function Values({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const { mutate, error, busy } = useMutate(reload);
  const clarity = useAi<ClarityVerdict>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const created = await mutate(() => api.post("/values", { name, description }));
    if (created) {
      setName("");
      setDescription("");
    }
  }

  async function applyRewrite(value: Value, result: ClarityVerdict) {
    await mutate(() =>
      api.patch(`/values/${value.id}`, {
        name: result.sharpenedTitle,
        description: result.sharpenedDescription,
      }),
    );
    clarity.clear();
  }

  return (
    <section>
      <header className="view-head">
        <h2>Values</h2>
        <p>
          The root of everything below. Nothing sits above a value — it is the thing you
          measure the rest against.
        </p>
      </header>

      {error && <Notice>{error}</Notice>}

      <form className="form" onSubmit={add}>
        <Field label="Name" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Deep focus"
            required
          />
        </Field>
        <Field label="Why this matters to you" hint="The AI leans on this when judging alignment.">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Shallow, fragmented work leaves me busy and nowhere."
          />
        </Field>
        <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
          Add value
        </Button>
      </form>

      {data.values.length === 0 ? (
        <Empty>No values yet. Start with three or four — you can sharpen them later.</Empty>
      ) : (
        <div className="list">
          {data.values.map((value) => {
            const children = data.longTermGoals.filter((g) => g.alignedWith === value.id);
            return (
              <Card key={value.id}>
                <div className="card-head">
                  <h3>{value.name}</h3>
                  <div className="card-actions">
                    <Button
                      onClick={() => clarity.run(value.id, () => askClarity("values", value.id))}
                    >
                      Sharpen
                    </Button>
                    <Button variant="danger" onClick={() => mutate(() => api.remove(`/values/${value.id}`))}>
                      Delete
                    </Button>
                  </div>
                </div>
                {value.description && <p className="card-body">{value.description}</p>}
                <p className="card-meta">
                  {children.length === 0
                    ? "No long-term goals serve this yet"
                    : `${children.length} long-term goal${children.length === 1 ? "" : "s"}`}
                </p>
                <AiPanel state={clarity.state} id={value.id} onClose={clarity.clear}>
                  {(result) => (
                    <ClarityResult result={result} onApply={(r) => applyRewrite(value, r)} />
                  )}
                </AiPanel>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
