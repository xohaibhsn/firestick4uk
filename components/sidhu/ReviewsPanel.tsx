"use client";

import { useCallback, useEffect, useId, useState } from "react";
import type { AdminCustomerReview, CustomerReviewStatus } from "@/lib/customerReviews";

type ReviewItem = AdminCustomerReview & { base_hash?: string };

type ListResponse = {
  items: ReviewItem[];
  total: number;
  page: number;
  pageSize: number;
};

type StatusFilter = CustomerReviewStatus | "all";

type Props = {
  onPendingCount?: (n: number) => void;
  onSessionExpired?: () => void;
  onPermError?: () => void;
};

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5 stars`} role="img">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ color: i < rating ? "#F59E0B" : "#E5E5E5" }}>
          ★
        </span>
      ))}
    </span>
  );
}

export default function ReviewsPanel({
  onPendingCount,
  onSessionExpired,
  onPermError,
}: Props) {
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [showOriginalIds, setShowOriginalIds] = useState<Record<number, boolean>>({});
  const [editTarget, setEditTarget] = useState<ReviewItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editRating, setEditRating] = useState(5);
  const [editText, setEditText] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReviewItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const editTitleId = useId();
  const deleteTitleId = useId();

  const handleAuth = useCallback(
    (res: Response) => {
      if (res.status === 401) {
        onSessionExpired?.();
        return true;
      }
      if (res.status === 403) {
        onPermError?.();
        return true;
      }
      return false;
    },
    [onSessionExpired, onPermError]
  );

  const refreshPendingBadge = useCallback(async () => {
    try {
      const res = await fetch("/api/admin-reviews?status=pending&page=1", {
        credentials: "include",
      });
      if (handleAuth(res)) return;
      if (!res.ok) return;
      const json = (await res.json()) as ListResponse;
      onPendingCount?.(Number(json.total || 0));
    } catch {
      /* ignore */
    }
  }, [handleAuth, onPendingCount]);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/admin-reviews?status=${encodeURIComponent(status)}&page=${page}`,
        { credentials: "include" }
      );
      if (handleAuth(res)) return;
      if (!res.ok) {
        setMsg("Could not load reviews.");
        return;
      }
      const json = (await res.json()) as ListResponse;
      setData(json);
    } catch {
      setMsg("Could not load reviews.");
    } finally {
      setLoading(false);
    }
  }, [status, page, handleAuth]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void refreshPendingBadge();
  }, [refreshPendingBadge, data]);

  async function patchAction(
    id: number,
    action: "approve" | "reject",
    expectedStatus: CustomerReviewStatus
  ) {
    setMsg(null);
    const res = await fetch("/api/admin-reviews", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, expected_status: expectedStatus }),
    });
    if (handleAuth(res)) return;
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg((j as any).error || "Action failed.");
      if (res.status === 409) {
        await load();
        await refreshPendingBadge();
      }
      return;
    }
    await load();
    await refreshPendingBadge();
  }

  function openEdit(item: ReviewItem) {
    setEditTarget(item);
    setEditName(item.display_name);
    setEditRating(Number(item.rating));
    setEditText(item.review_text);
    setEditNote("");
    setEditError(null);
  }

  async function saveEdit() {
    if (!editTarget) return;
    setEditError(null);
    if (!editNote.trim()) {
      setEditError("Edit note is required.");
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch("/api/admin-reviews", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editTarget.id,
          action: "edit",
          display_name: editName,
          rating: editRating,
          review_text: editText,
          edit_note: editNote.trim(),
          base_hash: editTarget.base_hash,
        }),
      });
      if (handleAuth(res)) return;
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError((j as any).error || "Edit failed.");
        if (res.status === 409) {
          await load();
          await refreshPendingBadge();
        }
        return;
      }
      setEditTarget(null);
      await load();
    } finally {
      setEditSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const qs = new URLSearchParams({
        id: String(deleteTarget.id),
        expected_status: deleteTarget.status,
      });
      const res = await fetch(`/api/admin-reviews?${qs.toString()}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (handleAuth(res)) return;
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg((j as any).error || "Delete failed.");
        if (res.status === 409) {
          await load();
          await refreshPendingBadge();
        }
        return;
      }
      setDeleteTarget(null);
      await load();
      await refreshPendingBadge();
    } finally {
      setDeleteBusy(false);
    }
  }

  const chips: { id: StatusFilter; label: string }[] = [
    { id: "pending", label: "Pending" },
    { id: "approved", label: "Approved" },
    { id: "rejected", label: "Rejected" },
    { id: "all", label: "All" },
  ];

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  return (
    <div data-testid="reviews-panel">
      <p style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.55, marginBottom: 16, maxWidth: 720 }}>
        Moderate for spam, abuse or personal data. Do not reject genuine reviews only because they
        are negative; edits must not change the meaning.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            className={status === c.id ? "btn-primary" : "btn-secondary"}
            style={{ fontSize: 13, padding: "6px 12px" }}
            onClick={() => {
              setStatus(c.id);
              setPage(1);
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {msg ? (
        <div
          style={{
            marginBottom: 12,
            padding: "8px 12px",
            borderRadius: 8,
            background: "rgba(255,68,68,0.08)",
            color: "#b91c1c",
            fontSize: 13,
          }}
        >
          {msg}
        </div>
      ) : null}

      {loading ? (
        <div style={{ color: "#888", padding: 24 }}>Loading…</div>
      ) : !data || data.items.length === 0 ? (
        <div style={{ color: "#888", padding: 24 }}>No reviews in this filter.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.items.map((item) => {
            const showOrig = !!showOriginalIds[item.id];
            const hasOriginal =
              item.original_text != null &&
              String(item.original_text).length > 0 &&
              item.original_text !== item.review_text;
            return (
              <article
                key={item.id}
                style={{
                  border: "1px solid #E5E5E5",
                  borderRadius: 12,
                  padding: 16,
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <strong>{item.display_name}</strong>
                  <Stars rating={Number(item.rating)} />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color:
                        item.status === "approved"
                          ? "#065F46"
                          : item.status === "rejected"
                            ? "#991B1B"
                            : "#92400E",
                      background:
                        item.status === "approved"
                          ? "#ECFDF5"
                          : item.status === "rejected"
                            ? "#FEF2F2"
                            : "#FFFBEB",
                      padding: "2px 8px",
                      borderRadius: 4,
                    }}
                  >
                    {item.status}
                  </span>
                  {Number(item.is_verified) === 1 ? (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#065F46",
                        background: "#ECFDF5",
                        border: "1px solid #A7F3D0",
                        borderRadius: 4,
                        padding: "2px 8px",
                      }}
                    >
                      Verified order
                    </span>
                  ) : null}
                  <span style={{ fontSize: 12, color: "#64748b", marginLeft: "auto" }}>
                    {String(item.created_at || "").slice(0, 10)}
                  </span>
                </div>
                <p style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.55, color: "#374151" }}>
                  {showOrig && hasOriginal ? item.original_text : item.review_text}
                </p>
                {hasOriginal ? (
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      color: "#4B5563",
                      marginBottom: 10,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={showOrig}
                      onChange={(e) =>
                        setShowOriginalIds((m) => ({
                          ...m,
                          [item.id]: e.target.checked,
                        }))
                      }
                    />
                    Show original
                  </label>
                ) : null}
                {item.edit_note ? (
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                    Edit note: {item.edit_note}
                  </div>
                ) : null}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {item.status !== "approved" ? (
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ fontSize: 13 }}
                      onClick={() => void patchAction(item.id, "approve", item.status)}
                    >
                      Approve
                    </button>
                  ) : null}
                  {item.status !== "rejected" ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: 13 }}
                      onClick={() => void patchAction(item.id, "reject", item.status)}
                    >
                      Reject
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: 13 }}
                    onClick={() => openEdit(item)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: 13, color: "#DC2626", borderColor: "#FECACA" }}
                    onClick={() => setDeleteTarget(item)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {data && data.total > data.pageSize ? (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginTop: 16,
            fontSize: 13,
          }}
        >
          <button
            type="button"
            className="btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span>
            Page {page} / {totalPages} ({data.total} total)
          </span>
          <button
            type="button"
            className="btn-secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      ) : null}

      {editTarget ? (
        <div className="modal-overlay" role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={editTitleId}
            style={{ maxWidth: 520 }}
          >
            <div className="modal-title" id={editTitleId}>
              Edit review #{editTarget.id}
            </div>
            <div className="modal-field">
              <label htmlFor="rv-edit-name">Display name</label>
              <input
                id="rv-edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={60}
              />
            </div>
            <div className="modal-field">
              <label htmlFor="rv-edit-rating">Rating</label>
              <input
                id="rv-edit-rating"
                type="number"
                min={1}
                max={5}
                value={editRating}
                onChange={(e) => setEditRating(Number(e.target.value))}
              />
            </div>
            <div className="modal-field">
              <label htmlFor="rv-edit-text">Review text</label>
              <textarea
                id="rv-edit-text"
                rows={5}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                maxLength={1500}
              />
            </div>
            <div className="modal-field">
              <label htmlFor="rv-edit-note">Edit note (required)</label>
              <input
                id="rv-edit-note"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                maxLength={255}
                placeholder="Why was this edited?"
              />
            </div>
            {editError ? (
              <p style={{ color: "#b91c1c", fontSize: 13 }} role="alert">
                {editError}
              </p>
            ) : null}
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditTarget(null)}
                disabled={editSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void saveEdit()}
                disabled={editSaving}
              >
                {editSaving ? "Saving…" : "Save edit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="modal-overlay" role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={deleteTitleId}
            style={{ maxWidth: 420 }}
          >
            <div className="modal-title" id={deleteTitleId}>
              Delete review?
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: "#374151" }}>
              Permanently delete the review by <strong>{deleteTarget.display_name}</strong>? This
              cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ background: "#DC2626", borderColor: "#DC2626" }}
                onClick={() => void confirmDelete()}
                disabled={deleteBusy}
              >
                {deleteBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
