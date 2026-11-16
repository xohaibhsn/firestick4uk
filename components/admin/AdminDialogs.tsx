"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "success" | "error" | "info";

type ToastItem = { id: number; message: string; kind: ToastKind };

type ConfirmState = {
  message: string;
  resolve: (ok: boolean) => void;
};

type PromptState = {
  message: string;
  defaultValue: string;
  resolve: (value: string | null) => void;
};

export type AdminChoiceOption = {
  id: string;
  label: string;
  /** Visual emphasis — primary = Overwrite-style danger/emphasis */
  variant?: "default" | "primary" | "danger";
};

type ChoiceState = {
  message: string;
  options: AdminChoiceOption[];
  resolve: (id: string | null) => void;
};

type AdminDialogApi = {
  showToast: (message: string, kind?: ToastKind) => void;
  confirm: (message: string) => Promise<boolean>;
  prompt: (message: string, defaultValue?: string) => Promise<string | null>;
  /** Multi-button dialog; resolves to option id, or null when Cancel / dismiss. */
  choose: (message: string, options: AdminChoiceOption[]) => Promise<string | null>;
};

const AdminDialogContext = createContext<AdminDialogApi | null>(null);

let toastSeq = 0;

export function useAdminDialogs(): AdminDialogApi {
  const ctx = useContext(AdminDialogContext);
  if (!ctx) {
    // Fallback for tests / isolated mounts — never use window.* in production tree.
    return {
      showToast: (message) => {
        console.info("[admin-toast]", message);
      },
      confirm: async (message) => {
        console.warn("[admin-confirm-fallback]", message);
        return false;
      },
      prompt: async () => null,
      choose: async () => null,
    };
  }
  return ctx;
}

/** Hook-friendly wrappers matching window.alert / confirm / prompt semantics. */
export function useAdminAlert() {
  const { showToast } = useAdminDialogs();
  return useCallback(
    (message: string) => {
      showToast(String(message ?? ""), "info");
    },
    [showToast]
  );
}

export function AdminDialogProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [choiceState, setChoiceState] = useState<ChoiceState | null>(null);

  const showToast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev, { id, message: String(message ?? ""), kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const confirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ message: String(message ?? ""), resolve });
    });
  }, []);

  const prompt = useCallback((message: string, defaultValue = "") => {
    return new Promise<string | null>((resolve) => {
      setPromptValue(String(defaultValue ?? ""));
      setPromptState({
        message: String(message ?? ""),
        defaultValue: String(defaultValue ?? ""),
        resolve,
      });
    });
  }, []);

  const choose = useCallback((message: string, options: AdminChoiceOption[]) => {
    return new Promise<string | null>((resolve) => {
      setChoiceState({
        message: String(message ?? ""),
        options: Array.isArray(options) ? options : [],
        resolve,
      });
    });
  }, []);

  const api: AdminDialogApi = { showToast, confirm, prompt, choose };

  return (
    <AdminDialogContext.Provider value={api}>
      {children}
      <div
        className="admin-toast-stack"
        aria-live="polite"
        aria-relevant="additions"
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 10050,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxWidth: 360,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            style={{
              pointerEvents: "auto",
              padding: "12px 14px",
              borderRadius: 10,
              fontSize: 13,
              lineHeight: 1.4,
              color: "#fff",
              background:
                t.kind === "success"
                  ? "#15803d"
                  : t.kind === "error"
                    ? "#b91c1c"
                    : "#1e293b",
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
              whiteSpace: "pre-wrap",
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
      {confirmState && (
        <AdminConfirmModal
          message={confirmState.message}
          onCancel={() => {
            confirmState.resolve(false);
            setConfirmState(null);
          }}
          onConfirm={() => {
            confirmState.resolve(true);
            setConfirmState(null);
          }}
        />
      )}
      {promptState && (
        <AdminPromptModal
          message={promptState.message}
          value={promptValue}
          onChange={setPromptValue}
          onCancel={() => {
            promptState.resolve(null);
            setPromptState(null);
          }}
          onConfirm={() => {
            promptState.resolve(promptValue);
            setPromptState(null);
          }}
        />
      )}
      {choiceState && (
        <AdminChoiceModal
          message={choiceState.message}
          options={choiceState.options}
          onCancel={() => {
            choiceState.resolve(null);
            setChoiceState(null);
          }}
          onChoose={(id) => {
            choiceState.resolve(id);
            setChoiceState(null);
          }}
        />
      )}
    </AdminDialogContext.Provider>
  );
}

function useFocusTrap(active: boolean, containerRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active || !containerRef.current) return;
    const root = containerRef.current;
    const focusable = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const nodes = focusable();
    (nodes[0] || root).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusable();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [active, containerRef]);
}

function AdminConfirmModal({
  message,
  onCancel,
  onConfirm,
}: {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, panelRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10060,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          width: "min(440px, 100%)",
          background: "#fff",
          color: "#0f172a",
          borderRadius: 12,
          padding: "20px 20px 16px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.28)",
          outline: "none",
        }}
      >
        <h2 id={titleId} style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>
          Confirm
        </h2>
        <p style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
          {message}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            className="action-btn"
            onClick={onCancel}
            style={{ padding: "8px 14px" }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="action-btn btn-delete"
            onClick={onConfirm}
            style={{ padding: "8px 14px" }}
            autoFocus
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminChoiceModal({
  message,
  options,
  onCancel,
  onChoose,
}: {
  message: string;
  options: AdminChoiceOption[];
  onCancel: () => void;
  onChoose: (id: string) => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, panelRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="presentation"
      data-testid="admin-choice-dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10060,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          width: "min(480px, 100%)",
          background: "#fff",
          color: "#0f172a",
          borderRadius: 12,
          padding: "20px 20px 16px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.28)",
          outline: "none",
        }}
      >
        <h2 id={titleId} style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>
          Conflict
        </h2>
        <p
          data-testid="admin-choice-message"
          style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}
        >
          {message}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={
                opt.variant === "danger" || opt.variant === "primary"
                  ? "action-btn btn-delete"
                  : "action-btn btn-view"
              }
              data-testid={`admin-choice-${opt.id}`}
              onClick={() => onChoose(opt.id)}
              style={{ padding: "8px 14px" }}
              autoFocus={opt.id === "reload"}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            className="action-btn"
            data-testid="admin-choice-cancel"
            onClick={onCancel}
            style={{ padding: "8px 14px" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminPromptModal({
  message,
  value,
  onChange,
  onCancel,
  onConfirm,
}: {
  message: string;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const inputId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, panelRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10060,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          width: "min(440px, 100%)",
          background: "#fff",
          color: "#0f172a",
          borderRadius: 12,
          padding: "20px 20px 16px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.28)",
          outline: "none",
        }}
      >
        <h2 id={titleId} style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>
          Input required
        </h2>
        <label htmlFor={inputId} style={{ display: "block", marginBottom: 8, fontSize: 14, whiteSpace: "pre-wrap" }}>
          {message}
        </label>
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onConfirm();
            }
          }}
          autoFocus
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            marginBottom: 16,
            fontSize: 14,
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="action-btn" onClick={onCancel} style={{ padding: "8px 14px" }}>
            Cancel
          </button>
          <button
            type="button"
            className="action-btn btn-view"
            onClick={onConfirm}
            style={{ padding: "8px 14px" }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
