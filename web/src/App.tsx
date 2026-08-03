import { useEffect, useState } from "react";
import { api } from "./api";
import { useData } from "./useData";
import { Notice } from "./ui";
import { Values } from "./views/Values";
import { LongTermGoals } from "./views/LongTermGoals";
import { QuarterlyGoals } from "./views/QuarterlyGoals";
import { WeeklyPriorities } from "./views/WeeklyPriorities";
import { DailyTasks } from "./views/DailyTasks";

const TABS = [
  { id: "values", label: "Values" },
  { id: "long-term", label: "Long-term" },
  { id: "quarterly", label: "Quarterly" },
  { id: "weekly", label: "Weekly" },
  { id: "daily", label: "Daily" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function App() {
  const { data, loading, error, reload } = useData();
  const [tab, setTab] = useState<TabId>("values");
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .get<{ configured: boolean }>("/ai/status")
      .then((status) => setAiConfigured(status.configured))
      .catch(() => setAiConfigured(null));
  }, []);

  const counts: Record<TabId, number> = {
    values: data.values.length,
    "long-term": data.longTermGoals.length,
    quarterly: data.quarterlyGoals.length,
    weekly: data.weeklyPriorities.length,
    daily: data.dailyTasks.length,
  };

  return (
    <div className="app">
      <header className="app-head">
        <h1>PersonalOS</h1>
        <p>Values down to today, and whether the two still agree.</p>
      </header>

      <nav className="tabs">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            className={`tab ${tab === id ? "tab-active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
            <span className="tab-count">{counts[id]}</span>
          </button>
        ))}
      </nav>

      <main>
        {error && <Notice>{error}</Notice>}

        {aiConfigured === false && (
          <Notice kind="info">
            No <code>ANTHROPIC_API_KEY</code> set, so alignment checking, sharpening, and weekly
            guidance will fail. Copy <code>.env.example</code> to <code>.env</code>, add your key,
            and restart. Everything else works without it.
          </Notice>
        )}

        {loading ? (
          <p className="empty">Loading…</p>
        ) : (
          <>
            {tab === "values" && <Values data={data} reload={reload} />}
            {tab === "long-term" && <LongTermGoals data={data} reload={reload} />}
            {tab === "quarterly" && <QuarterlyGoals data={data} reload={reload} />}
            {tab === "weekly" && <WeeklyPriorities data={data} reload={reload} />}
            {tab === "daily" && <DailyTasks data={data} reload={reload} />}
          </>
        )}
      </main>
    </div>
  );
}
