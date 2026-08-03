import { useCallback, useState } from "react";
import { api } from "./api";
import { Button, Badge } from "./ui";
import type { AlignmentVerdict, ClarityVerdict, WeeklyGuidance } from "../../shared/types";

type AiState<T> =
  | { forId: string; status: "loading" }
  | { forId: string; status: "done"; result: T }
  | { forId: string; status: "error"; message: string }
  | null;

/** Tracks one in-flight AI call at a time, keyed by the item it belongs to. */
export function useAi<T>() {
  const [state, setState] = useState<AiState<T>>(null);

  const run = useCallback(async (forId: string, request: () => Promise<T>) => {
    setState({ forId, status: "loading" });
    try {
      setState({ forId, status: "done", result: await request() });
    } catch (err) {
      setState({
        forId,
        status: "error",
        message: err instanceof Error ? err.message : "The request failed",
      });
    }
  }, []);

  const clear = useCallback(() => setState(null), []);

  return { state, run, clear };
}

export const askAlignment = (collection: string, id: string) =>
  api.post<AlignmentVerdict>("/ai/alignment", { collection, id });

export const askClarity = (collection: string, id: string) =>
  api.post<ClarityVerdict>("/ai/clarity", { collection, id });

export const askWeeklyGuidance = (week: string) =>
  api.post<WeeklyGuidance>("/ai/weekly-guidance", { week });

/** Shared shell: spinner while loading, message on failure, children when done. */
export function AiPanel<T>({
  state,
  id,
  onClose,
  children,
}: {
  state: AiState<T>;
  id: string;
  onClose: () => void;
  children: (result: T) => React.ReactNode;
}) {
  if (!state || state.forId !== id) return null;

  return (
    <div className="ai-panel">
      <div className="ai-panel-head">
        <span className="ai-label">Claude</span>
        <Button variant="ghost" onClick={onClose}>
          Dismiss
        </Button>
      </div>
      {state.status === "loading" && <p className="ai-thinking">Thinking…</p>}
      {state.status === "error" && <p className="ai-error">{state.message}</p>}
      {state.status === "done" && children(state.result)}
    </div>
  );
}

const ALIGNMENT_TONE: Record<AlignmentVerdict["alignment"], string> = {
  strong: "done",
  weak: "warn",
  none: "bad",
};

export function AlignmentResult({ result }: { result: AlignmentVerdict }) {
  return (
    <div className="ai-body">
      <p>
        <Badge tone={ALIGNMENT_TONE[result.alignment]}>{result.alignment} alignment</Badge>
      </p>
      <p>{result.reasoning}</p>
      {result.suggestions.length > 0 && (
        <ul className="ai-list">
          {result.suggestions.map((suggestion, i) => (
            <li key={i}>{suggestion}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ClarityResult({
  result,
  onApply,
}: {
  result: ClarityVerdict;
  onApply?: (result: ClarityVerdict) => void;
}) {
  return (
    <div className="ai-body">
      <p className="ai-critique">{result.critique}</p>
      <dl className="ai-fields">
        <dt>Sharpened title</dt>
        <dd>{result.sharpenedTitle}</dd>
        {result.sharpenedDescription && (
          <>
            <dt>Sharpened description</dt>
            <dd>{result.sharpenedDescription}</dd>
          </>
        )}
      </dl>
      {result.successMetrics.length > 0 && (
        <>
          <p className="ai-subhead">Success metrics</p>
          <ul className="ai-list">
            {result.successMetrics.map((metric, i) => (
              <li key={i}>{metric}</li>
            ))}
          </ul>
        </>
      )}
      {onApply && (
        <Button variant="primary" onClick={() => onApply(result)}>
          Apply this rewrite
        </Button>
      )}
    </div>
  );
}

export function GuidanceResult({
  result,
  goalTitle,
  onAdopt,
}: {
  result: WeeklyGuidance;
  goalTitle: (id: string) => string;
  onAdopt: (title: string, quarterlyGoalId: string, rationale: string) => void;
}) {
  return (
    <div className="ai-body">
      <p>{result.summary}</p>

      {result.suggestedFocus.length > 0 && (
        <>
          <p className="ai-subhead">Worth considering this week</p>
          <ul className="ai-suggestions">
            {result.suggestedFocus.map((item, i) => (
              <li key={i}>
                <div>
                  <strong>{item.title}</strong>
                  <p className="ai-rationale">{item.rationale}</p>
                  <p className="ai-serves">serves: {goalTitle(item.quarterlyGoalId)}</p>
                </div>
                <Button
                  onClick={() => onAdopt(item.title, item.quarterlyGoalId, item.rationale)}
                >
                  Add as priority
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      {result.neglectedGoals.length > 0 && (
        <>
          <p className="ai-subhead">Getting no attention</p>
          <ul className="ai-list">
            {result.neglectedGoals.map((item, i) => (
              <li key={i}>
                <strong>{goalTitle(item.quarterlyGoalId)}</strong> — {item.note}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
