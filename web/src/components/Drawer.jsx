import React from "react";

export default function Drawer({ open, onClose, node }) {
  return (
    <div
      className="fixed top-0 h-full w-[420px] bg-bg-card border-l border-white/5 shadow-soft transition-[right] duration-200 z-50"
      style={{ right: open ? 0 : -420 }}
    >
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <h3 className="text-lg font-semibold">{node?.label || "Details"}</h3>
        <button onClick={onClose} className="px-3 py-1 rounded-lg bg-bg hover:bg-bg/80 border border-white/5">Close</button>
      </div>
      <div className="p-4 space-y-6">
        <div>
          <h4 className="font-medium mb-2">Concepts</h4>
          <div className="flex flex-wrap gap-2">
            {(node?.concepts || []).map((c,i)=>(
              <span key={i} className="px-2 py-1 text-xs rounded-full bg-bg border border-white/5">{c}</span>
            ))}
          </div>
        </div>
        <div>
          <h4 className="font-medium mb-2">Source docs</h4>
          <ul className="list-disc ms-5 space-y-1 text-ink-subtle">
            {(node?.source_docs || []).map((d,i)=><li key={i}>{d}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
