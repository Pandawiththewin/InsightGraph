import React, { useState } from "react";
import { IoSparkles, IoCloudUploadOutline, IoDownloadOutline, IoPlay, IoFilter } from "react-icons/io5";
import Drawer from "./components/Drawer.jsx";
import GraphView from "./components/GraphView.jsx";
import ChatBar from "./components/ChatBar.jsx";
import AnalysisPanel from "./components/AnalysisPanel.jsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

export default function App() {
  const [files, setFiles] = useState([]);
  const [graph, setGraph] = useState(null);
  const [summary, setSummary] = useState("");
  const [filter, setFilter] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeNode, setActiveNode] = useState(null);
  const [error, setError] = useState("");

  // Chat state
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loadingAsk, setLoadingAsk] = useState(false);
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);

  const onAnalyze = async () => {
    try {
      setError("");
      setLoadingAnalyze(true);
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch(`${API_URL}/analyze`, { method: "POST", body: fd });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message || "Pipeline error");
      setGraph({ clusters: json.clusters || [], links: json.links || [] });
      setSummary(json.summary || "");
      setAnswer("");
    } catch (e) {
      setError(e.message || "Failed to analyze");
    } finally {
      setLoadingAnalyze(false);
    }
  };

  const loadPreset = async (qs) => {
    const r = await fetch(`${API_URL}/sample${qs}`);
    const j = await r.json();
    setGraph({ clusters: j.clusters, links: j.links });
    setSummary(j.summary);
    setAnswer("");
  };

  const onAsk = async () => {
    try {
      setLoadingAsk(true);
      setAnswer("");
      const res = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, graph: { ...(graph || {}), summary } }),
      });
      const json = await res.json();
      if (json?.answer) setAnswer(json.answer);
      else if (json?.detail) throw new Error(json.detail);
      else throw new Error("No answer returned");
    } catch (e) {
      setAnswer(`Error: ${e.message || e}`);
    } finally {
      setLoadingAsk(false);
    }
  };

  const onDownload = () => {
    const blob = new Blob([JSON.stringify({ ...(graph || {}), summary }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "insightgraph.json";
    a.click();
  };

  const nodesCount = graph?.clusters?.length || 0;
  const edgesCount = graph?.links?.length || 0;

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Top bar with centered chat */}
      <div className="sticky top-0 z-30 border-b border-white/5 bg-bg/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-5 py-3 flex items-center gap-4">
          {/* Brand (left) */}
          <div className="flex items-center gap-3 min-w-[220px]">
            <div className="h-8 w-8 rounded-xl bg-linear-to-br from-brand to-accent" />
            <div>
              <div className="font-semibold leading-tight">InsightGraph</div>
              <div className="text-xs text-ink-subtle">Ask • Analyze • Explore</div>
            </div>
          </div>

          {/* Chat (center) */}
          <div className="flex-1">
            <ChatBar
              question={question}
              setQuestion={setQuestion}
              onAsk={onAsk}
              loading={loadingAsk}
            />
          </div>

          {/* Actions (right) */}
          <div className="min-w-40 flex items-center gap-2 justify-end">
            <button
              onClick={() => loadPreset("?size=medium")}
              className="px-3 py-2 rounded-lg bg-bg-card border border-white/5 hover:border-white/10"
              title="Load medium sample"
            >
              <span className="inline-flex items-center gap-2"><IoSparkles/> Sample</span>
            </button>

            <button
              onClick={() => loadPreset("?size=large")}
              className="px-3 py-2 rounded-lg bg-bg-card border border-white/5 hover:border-white/10"
              title="Load big sample"
            >
              Big
            </button>

            <button
              onClick={() => loadPreset("?clusters=22&concepts=9&link_prob=0.5&seed=9")}
              className="px-3 py-2 rounded-lg bg-bg-card border border-white/5 hover:border-white/10"
              title="Load huge sample"
            >
              Huge
            </button>
          </div>
        </div>
      </div>

      {/* Main three-column feel: left analysis, center graph */}
      <div className="mx-auto max-w-7xl px-5 py-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT: Analysis + Upload + Filter */}
        <div className="lg:col-span-4 space-y-5">
          <AnalysisPanel answer={answer} nodesCount={nodesCount} edgesCount={edgesCount} />

          <div className="rounded-2xl border border-white/5 bg-bg-card p-5 shadow-soft">
            <div className="font-semibold mb-3">Upload</div>
            <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-white/10 rounded-xl py-10 hover:border-white/20 cursor-pointer">
              <IoCloudUploadOutline size={28}/>
              <span className="text-ink-subtle text-sm">Drop .pdf / .txt or click to select</span>
              <input className="hidden" type="file" multiple accept=".pdf,.txt" onChange={(e)=>setFiles(Array.from(e.target.files))}/>
            </label>
            <div className="text-xs text-ink-subtle mt-3">{files.length} file(s) selected</div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={onAnalyze}
                disabled={loadingAnalyze || files.length===0}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-brand hover:bg-brand/90 disabled:opacity-50"
              >
                <IoPlay/>{loadingAnalyze ? "Analyzing…" : "Generate Graph"}
              </button>
              <button
                onClick={onDownload}
                disabled={!graph}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-bg-card border border-white/5 hover:border-white/10 disabled:opacity-50"
              >
                <IoDownloadOutline/> JSON
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          </div>

          <div className="rounded-2xl border border-white/5 bg-bg-card p-5 shadow-soft">
            <div className="font-semibold mb-3">Filter</div>
            <div className="relative">
              <IoFilter className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"/>
              <input
                placeholder="e.g., onboarding, carbon"
                value={filter}
                onChange={(e)=>setFilter(e.target.value)}
                className="w-full ps-10 pe-4 py-2 rounded-lg bg-bg border border-white/5 outline-none focus:border-white/15"
              />
            </div>
            <div className="mt-4 text-xs text-ink-subtle">Nodes: {nodesCount} · Edges: {edgesCount}</div>
          </div>
        </div>

        {/* CENTER: Summary + Graph */}
        <div className="lg:col-span-8 space-y-5">
          <div className="rounded-2xl border border-white/5 bg-bg-card p-5 shadow-soft">
            <div className="font-semibold mb-2">Summary</div>
            <p className="text-ink-subtle whitespace-pre-wrap">{summary || "—"}</p>
          </div>

          <div className="rounded-2xl border border-white/5 bg-bg-card shadow-soft h-[70vh] overflow-hidden">
            <GraphView
              data={graph}
              filter={filter}
              onNodeClick={(n)=>{ setActiveNode(n); setDrawerOpen(true); }}
            />
          </div>
        </div>
      </div>

      {/* Drawer for node details */}
      <Drawer open={drawerOpen} onClose={()=>setDrawerOpen(false)} node={activeNode}/>
    </div>
  );
}
