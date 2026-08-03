import { useState } from "react";
import { api } from "../api";
import { useMutate, type Data } from "../useData";
import { Badge, Button, Card, Empty, Field, Notice, joinList, splitList } from "../ui";
import { AiPanel, AlignmentResult, askAlignment, useAi } from "../ai";
import { todayISO } from "../period";
import type { AlignmentVerdict } from "../../../shared/types";

const STATUSES = ["not-started", "in-progress", "completed"] as const;

export function DailyTasks({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const { mutate, error, busy } = useMutate(reload);
  const alignment = useAi<AlignmentVerdict>();

  const [date, setDate] = useState(todayISO());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [alignedWith, setAlignedWith] = useState("");
  const [tags, setTags] = useState("");
  const [timeEstimate, setTimeEstimate] = useState("");

  const priorityTitle = (id: string) =>
    data.weeklyPriorities.find((p) => p.id === id)?.title ?? "(missing)";

  const forDate = data.dailyTasks.filter((task) => task.date === date);
  const unaligned = forDate.filter((task) => task.alignedWith === null).length;

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const created = await mutate(() =>
      api.post("/daily-tasks", {
        date,
        title,
        description,
        alignedWith: alignedWith || null,
        tags: splitList(tags),
        timeEstimate: timeEstimate || null,
      }),
    );
    if (created) {
      setTitle("");
      setDescription("");
      setTags("");
      setTimeEstimate("");
    }
  }

  return (
    <section>
      <header className="view-head">
        <h2>Daily tasks</h2>
        <p>
          The only level where the link upward is optional. Record what you actually did,
          including the work that served nothing you planned — that gap is the signal.
        </p>
      </header>

      {error && <Notice>{error}</Notice>}

      <form className="form" onSubmit={add}>
        <Field label="Date" required>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Title" required>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Chapter two, first pass"
            required
          />
        </Field>
        <Field
          label="Serves which weekly priority"
          hint="Leave blank when it serves none. That is a valid, useful answer."
        >
          <select value={alignedWith} onChange={(e) => setAlignedWith(e.target.value)}>
            <option value="">— not aligned to a priority —</option>
            {data.weeklyPriorities.map((priority) => (
              <option key={priority.id} value={priority.id}>
                {priority.week} — {priority.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </Field>
        <Field label="Tags" hint="Comma separated.">
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="writing, deep-work" />
        </Field>
        <Field label="Time estimate" hint="Minutes.">
          <input
            type="number"
            min="0"
            value={timeEstimate}
            onChange={(e) => setTimeEstimate(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
          Add task
        </Button>
      </form>

      {forDate.length > 0 && (
        <p className="summary">
          {forDate.length} task{forDate.length === 1 ? "" : "s"} on {date}
          {unaligned > 0 && ` · ${unaligned} serving no stated priority`}
        </p>
      )}

      {forDate.length === 0 ? (
        <Empty>Nothing recorded for {date}.</Empty>
      ) : (
        <div className="list">
          {forDate.map((task) => (
            <Card key={task.id}>
              <div className="card-head">
                <h3>{task.title}</h3>
                <div className="card-actions">
                  <select
                    value={task.status}
                    onChange={(e) =>
                      mutate(() => api.patch(`/daily-tasks/${task.id}`, { status: e.target.value }))
                    }
                    aria-label="Status"
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status.replace("-", " ")}
                      </option>
                    ))}
                  </select>
                  {task.alignedWith && (
                    <Button
                      onClick={() =>
                        alignment.run(task.id, () => askAlignment("daily-tasks", task.id))
                      }
                    >
                      Check alignment
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    onClick={() => mutate(() => api.remove(`/daily-tasks/${task.id}`))}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              {task.description && <p className="card-body">{task.description}</p>}
              <p className="card-meta">
                {task.alignedWith ? (
                  <>
                    serves <strong>{priorityTitle(task.alignedWith)}</strong>
                  </>
                ) : (
                  <Badge tone="warn">no stated priority</Badge>
                )}
                {task.tags.length > 0 && ` · ${joinList(task.tags)}`}
                {task.timeEstimate !== null && ` · est ${task.timeEstimate}m`}
              </p>
              <AiPanel state={alignment.state} id={task.id} onClose={alignment.clear}>
                {(result) => <AlignmentResult result={result} />}
              </AiPanel>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
