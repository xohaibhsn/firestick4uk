"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
};

const FIRST_MESSAGE = `👋 Hi! I'm Berlin, your Firestick4UK support assistant!

What device are you using?
- Firestick
- Smart TV (Samsung/LG)
- iPhone
- Android phone
- Roku

I'll help you find the perfect plan! 🎯`;

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hidden = pathname?.startsWith("/sidhu") || pathname?.startsWith("/erp");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  useEffect(() => {
    if (!open || loading) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(focusTimer);
  }, [open, loading, messages.length]);

  if (hidden) return null;

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = { role: "user", content: text, createdAt: new Date() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.map((message) => ({ role: message.role, content: message.content })),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.response) throw new Error(data.error || "Chat failed");

      setMessages([
        ...nextMessages,
        { role: "assistant", content: data.response, createdAt: new Date() },
      ]);
    } catch {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: "Sorry, I'm having trouble connecting. Please reach us directly on WhatsApp:\n+447934519060",
          createdAt: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes berlinPulse {
          0% { box-shadow:0 0 0 0 rgba(91,33,182,0.45); }
          70% { box-shadow:0 0 0 16px rgba(91,33,182,0); }
          100% { box-shadow:0 0 0 0 rgba(91,33,182,0); }
        }
        @keyframes berlinSlideUp {
          from { opacity:0; transform:translateY(18px); }
          to { opacity:1; transform:translateY(0); }
        }
        @keyframes berlinBounce {
          0%, 80%, 100% { transform:translateY(0); opacity:0.45; }
          40% { transform:translateY(-5px); opacity:1; }
        }
        .berlin-window {
          position:fixed;
          right:24px;
          bottom:24px;
          width:min(380px, calc(100vw - 32px));
          height:min(520px, calc(100dvh - 48px));
          background:#FFFFFF;
          border-radius:16px;
          box-shadow:0 8px 32px rgba(0,0,0,0.15);
          z-index:9999;
          overflow:hidden;
          display:flex;
          flex-direction:column;
          animation:berlinSlideUp 0.22s ease both;
          border:1px solid #E5E5E5;
          font-family:Arial, sans-serif;
        }
        .berlin-header {
          background:#5B21B6;
          color:#FFFFFF;
          padding:16px;
          display:flex;
          align-items:center;
          justify-content:space-between;
        }
        .berlin-title-wrap { display:flex; align-items:center; gap:10px; }
        .berlin-icon { width:38px; height:38px; border-radius:12px; background:rgba(255,255,255,0.14); display:flex; align-items:center; justify-content:center; font-size:20px; }
        .berlin-title { font-size:16px; font-weight:800; line-height:1.2; }
        .berlin-subtitle { font-size:12px; opacity:0.8; margin-top:2px; }
        .berlin-online { display:flex; align-items:center; gap:6px; font-size:12px; margin-top:6px; opacity:0.9; }
        .berlin-dot { width:8px; height:8px; border-radius:50%; background:#22C55E; }
        .berlin-close { background:transparent; border:none; color:#FFFFFF; font-size:22px; cursor:pointer; line-height:1; padding:4px; }
        .berlin-header-actions { display:flex; align-items:center; gap:8px; }
        .berlin-header-btn { width:30px; height:30px; border:none; border-radius:50%; background:rgba(255,255,255,0.14); color:#FFFFFF; cursor:pointer; font-size:20px; line-height:1; display:flex; align-items:center; justify-content:center; }
        .berlin-header-btn:hover { background:rgba(255,255,255,0.24); }
        .berlin-messages { flex:1; overflow-y:auto; padding:16px; background:#FFFFFF; }
        .berlin-message-row { display:flex; gap:8px; margin-bottom:14px; align-items:flex-end; }
        .berlin-message-row.user { justify-content:flex-end; }
        .berlin-avatar { width:26px; height:26px; border-radius:50%; background:#F3F4F6; display:flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0; }
        .berlin-bubble { max-width:78%; padding:10px 12px; border-radius:14px; font-size:14px; line-height:1.45; white-space:pre-line; color:#111827; background:#F3F4F6; }
        .berlin-message-row.user .berlin-bubble { background:#5B21B6; color:#FFFFFF; border-bottom-right-radius:4px; }
        .berlin-message-row.assistant .berlin-bubble { border-bottom-left-radius:4px; }
        .berlin-time { font-size:10px; color:#9CA3AF; margin-top:4px; }
        .berlin-message-row.user .berlin-time { text-align:right; }
        .berlin-typing { display:flex; gap:5px; padding:11px 12px; background:#F3F4F6; border-radius:14px; width:max-content; }
        .berlin-typing span { width:7px; height:7px; border-radius:50%; background:#9CA3AF; animation:berlinBounce 1.2s infinite; }
        .berlin-typing span:nth-child(2) { animation-delay:0.15s; }
        .berlin-typing span:nth-child(3) { animation-delay:0.3s; }
        .berlin-input-wrap { border-top:1px solid #E5E5E5; padding:12px; display:flex; gap:8px; background:#FFFFFF; }
        .berlin-input { flex:1; border:1px solid #E5E5E5; border-radius:999px; padding:11px 14px; font-size:14px; outline:none; color:#111111; background:#FFFFFF; }
        .berlin-input:focus { border-color:#5B21B6; box-shadow:0 0 0 3px rgba(91,33,182,0.1); }
        .berlin-send { width:44px; height:44px; border:none; border-radius:50%; background:#5B21B6; color:#FFFFFF; cursor:pointer; font-size:18px; display:flex; align-items:center; justify-content:center; }
        .berlin-send:disabled { opacity:0.5; cursor:not-allowed; }
        .berlin-button {
          position:fixed;
          bottom:24px;
          right:24px;
          width:60px;
          height:60px;
          border-radius:50%;
          border:none;
          background:#5B21B6;
          color:#FFFFFF;
          font-size:26px;
          z-index:9999;
          cursor:pointer;
          display:flex;
          align-items:center;
          justify-content:center;
          box-shadow:0 8px 24px rgba(91,33,182,0.35);
        }
        .berlin-button.closed { animation:berlinPulse 2s infinite; }
        @media(max-width:640px) {
          .berlin-window {
            left:0;
            right:0;
            bottom:0;
            width:100vw;
            height:min(560px, 88dvh);
            border-radius:16px 16px 0 0;
          }
          .berlin-button { right:18px; bottom:18px; }
        }
      `}</style>

      {open && (
        <div className="berlin-window" role="dialog" aria-label="Berlin Firestick4UK support chat">
          <div className="berlin-header">
            <div>
              <div className="berlin-title-wrap">
                <div className="berlin-icon">📺</div>
                <div>
                  <div className="berlin-title">Berlin</div>
                  <div className="berlin-subtitle">Firestick4UK Support</div>
                </div>
              </div>
              <div className="berlin-online"><span className="berlin-dot" /> Online</div>
            </div>
            <div className="berlin-header-actions">
              <button className="berlin-header-btn" onClick={() => setOpen(false)} aria-label="Minimise chat" title="Minimise">−</button>
              <button className="berlin-header-btn berlin-close" onClick={() => setOpen(false)} aria-label="Close chat" title="Close">×</button>
            </div>
          </div>

          <div className="berlin-messages">
            {messages.map((message, index) => (
              <div className={`berlin-message-row ${message.role}`} key={`${message.role}-${index}`}>
                {message.role === "assistant" && <div className="berlin-avatar">🤖</div>}
                <div>
                  <div className="berlin-bubble">{message.content}</div>
                  <div className="berlin-time">{formatTime(message.createdAt)}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="berlin-message-row assistant">
                <div className="berlin-avatar">🤖</div>
                <div className="berlin-typing" aria-label="Berlin is typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="berlin-input-wrap">
            <input
              ref={inputRef}
              className="berlin-input"
              placeholder="Type a message..."
              value={input}
              disabled={loading}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") sendMessage();
              }}
            />
            <button className="berlin-send" onClick={sendMessage} disabled={loading || !input.trim()} aria-label="Send message">
              ➤
            </button>
          </div>
        </div>
      )}

      {!open && (
        <button
          className="berlin-button closed"
          onClick={() => {
            if (messages.length === 0) {
              setMessages([{ role: "assistant", content: FIRST_MESSAGE, createdAt: new Date() }]);
            }
            setOpen(true);
          }}
          aria-label="Open chat"
        >
          💬
        </button>
      )}
    </>
  );
}
