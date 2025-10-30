import React from "react";

export default function AnalysisPanel({ answer, nodesCount, edgesCount }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-bg-card p-5 shadow-soft space-y-4">
      <div className="font-semibold">Analysis</div>
      <div className="text-sm text-ink-subtle">
        {answer ? <p className="whitespace-pre-wrap">{answer}</p>
                : "Ask a question from the bar above; the answer will appear here."}
      </div>
      <div className="text-xs text-ink-subtle border-t border-white/5 pt-3">
        Nodes: {nodesCount} · Edges: {edgesCount}
      </div>
    </div>
  );
}
