import { useState } from "react";
import { ASSIST_ACTIONS } from "../constants";
import { assistText } from "../lib/supabaseClient";
import type { ChatMessage } from "../types";

/** A real chat box for "مساعد المحقق" — a message transcript with its own
 * text input and send button, and the 5 fixed actions rendered as a row
 * of quick-suggestion chips around the input (not scattered loose
 * buttons). Clicking a chip sends that action as a message, exactly like
 * typing it; free text goes through the same send path. Results are
 * never applied to the main text automatically — each assistant message
 * carries its own "تطبيق على النص"/"تجاهل" controls. */
export function AssistToolbar({
  getText,
  onApply,
}: {
  getText: () => string;
  onApply: (newText: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (label: string, action: (typeof ASSIST_ACTIONS)[number]["key"] | "custom") => {
    const text = getText();
    if (!text.trim() || busy) return;
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", text: label };
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);
    try {
      // The 5 fixed actions are guaranteed to work (unchanged server
      // contract). Free-form text is sent as a "custom" action — this
      // requires a small Supabase Edge Function update to answer openly;
      // until that's deployed, it will surface as an error message below
      // rather than silently doing nothing.
      const resultText = await assistText(text, action as (typeof ASSIST_ACTIONS)[number]["key"]);
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", text: resultText },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: err instanceof Error ? err.message : "تعذّر تنفيذ الطلب",
          error: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const sendDraft = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    send(text, "custom");
  };

  return (
    <div className="border-t border-border bg-paper-dim/60 px-3 py-2">
      <div className="mb-1 text-xs font-semibold text-ink-soft">مساعد المحقق</div>

      {messages.length > 0 && (
        <div dir="rtl" className="mb-2 max-h-48 space-y-2 overflow-auto rounded-lg border border-border bg-white/50 p-2">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[85%] rounded-lg px-2 py-1.5 text-xs ${
                  m.role === "user"
                    ? "bg-bronze-light/40 text-ink"
                    : m.error
                    ? "bg-red-50 text-red-700"
                    : "bg-white text-ink border border-border"
                }`}
              >
                <p className="whitespace-pre-wrap font-naskh leading-relaxed">{m.text}</p>
                {m.role === "assistant" && !m.error && !m.applied && !m.dismissed && (
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      onClick={() => {
                        onApply(m.text);
                        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, applied: true } : x)));
                      }}
                      className="rounded-md bg-bronze px-2 py-0.5 text-[10px] text-white hover:bg-bronze/90"
                    >
                      تطبيق على النص
                    </button>
                    <button
                      onClick={() =>
                        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, dismissed: true } : x)))
                      }
                      className="rounded-md border border-border px-2 py-0.5 text-[10px] text-ink-soft hover:bg-paper-dim"
                    >
                      تجاهل
                    </button>
                  </div>
                )}
                {m.applied && <p className="mt-1 text-[10px] text-green-700">✓ طُبّق على النص</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick-suggestion chips — the 5 fixed actions, as suggestions
          around the input, not standalone scattered buttons */}
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        {ASSIST_ACTIONS.map((action) => (
          <button
            key={action.key}
            onClick={() => send(action.label, action.key)}
            disabled={busy}
            className="rounded-full border border-border bg-white/60 px-2.5 py-1 text-[11px] text-ink hover:bg-white disabled:opacity-50"
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* The chat box itself: a real input with its own send button */}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          dir="rtl"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendDraft();
          }}
          disabled={busy}
          placeholder="اكتب طلبك لمساعد المحقق هنا…"
          className="min-w-0 flex-1 rounded-md border border-border bg-white/80 px-2 py-1.5 text-xs text-ink outline-none placeholder:text-ink-soft/50 disabled:opacity-60"
        />
        <button
          onClick={sendDraft}
          disabled={busy || !draft.trim()}
          className="shrink-0 rounded-md bg-bronze px-3 py-1.5 text-xs text-white hover:bg-bronze/90 disabled:opacity-40"
        >
          {busy ? "جارٍ…" : "إرسال"}
        </button>
      </div>
    </div>
  );
}
