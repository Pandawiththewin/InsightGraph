import React from "react";
import { IoSend } from "react-icons/io5";

export default function ChatBar({ question, setQuestion, onAsk, loading }) {
  return (
    <div className="w-full flex items-center justify-center">
      <div className="w-full max-w-3xl">
        <div className="rounded-2xl border border-white/5 bg-bg-card shadow-soft px-4 py-2">
          <form
            className="flex items-center gap-3"
            onSubmit={(e)=>{ e.preventDefault(); onAsk(); }}
          >
            <input
              className="flex-1 bg-transparent outline-none text-ink placeholder:text-ink-subtle py-3"
              placeholder="Ask a question about the knowledge map…"
              value={question}
              onChange={(e)=>setQuestion(e.target.value)}
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-brand hover:bg-brand/90 disabled:opacity-50"
              title="Ask"
            >
              <IoSend/>
              <span className="hidden sm:inline">{loading ? "Asking…" : "Ask"}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
