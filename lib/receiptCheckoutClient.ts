/**
 * Checkout receipt selection/submit helpers shared by CartPage and integration tests.
 * Keeps optional-receipt policy: no file → allowed; rejected/pending failure → block bank submit;
 * explicit remove → allowed without receipt.
 */

import {
  RECEIPT_ERROR_DEFAULTS,
  classifyReceiptUploadHttpFailure,
  prepareReceiptDataUrlForUpload,
  type ReceiptClientValidation,
  type ReceiptUploadErrorKind,
  validateReceiptFileClient,
} from "./receiptUploadContract";

export type ReceiptSelectionState = {
  file: File | null;
  /** Last rejected filename retained for UI until explicit clear/replace. */
  rejectedName: string | null;
  selectError: string;
};

export const EMPTY_RECEIPT_SELECTION: ReceiptSelectionState = {
  file: null,
  rejectedName: null,
  selectError: "",
};

export function receiptSelectionBlocksBankSubmit(state: ReceiptSelectionState): boolean {
  return Boolean(state.selectError || state.rejectedName);
}

export function clearReceiptSelectionState(): ReceiptSelectionState {
  return { ...EMPTY_RECEIPT_SELECTION };
}

/**
 * Apply a file-input change.
 * - file=null with reason "cancel" preserves prior selection/rejection (picker cancel).
 * - file=null with reason "clear" is explicit remove.
 * - Invalid file → rejected state (no silent optional omit).
 */
export function applyReceiptFileChoice(
  prev: ReceiptSelectionState,
  file: File | null,
  opts: {
    reason: "pick" | "cancel" | "clear";
    formatError: (code: Exclude<ReceiptClientValidation, { ok: true }>["code"]) => string;
  }
): ReceiptSelectionState {
  if (opts.reason === "clear") {
    return clearReceiptSelectionState();
  }
  if (opts.reason === "cancel" || file == null) {
    // Picker cancellation must not wipe selection or rejected-selection state.
    return prev;
  }

  const check = validateReceiptFileClient(file);
  if (!check.ok) {
    return {
      file: null,
      rejectedName: String(file.name || "receipt"),
      selectError: opts.formatError(check.code),
    };
  }

  return {
    file,
    rejectedName: null,
    selectError: "",
  };
}

export function receiptStatusLabel(state: ReceiptSelectionState): "empty" | "selected" | "rejected" {
  if (state.file) return "selected";
  if (state.rejectedName || state.selectError) return "rejected";
  return "empty";
}

export function defaultReceiptErrorFormatter(
  code: Exclude<ReceiptClientValidation, { ok: true }>["code"]
): string {
  return RECEIPT_ERROR_DEFAULTS[code];
}

export type ReceiptUploadDuringCheckoutResult =
  | { ok: true; path: string }
  | { ok: false; kind: ReceiptUploadErrorKind };

/**
 * Actual checkout upload path used by CartPage.handleOrder.
 * FileReader → empty-MIME normalize → POST /api/upload-receipt.
 */
export async function uploadReceiptDuringCheckout(
  file: File,
  deps: {
    readAsDataURL?: (f: File) => Promise<string>;
    fetchImpl?: typeof fetch;
  } = {}
): Promise<ReceiptUploadDuringCheckoutResult> {
  const precheck = validateReceiptFileClient(file);
  if (!precheck.ok) {
    return { ok: false, kind: precheck.code };
  }

  const readAsDataURL =
    deps.readAsDataURL ||
    ((f: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("file_read"));
        reader.readAsDataURL(f);
      }));

  let rawDataUrl: string;
  try {
    rawDataUrl = await readAsDataURL(file);
  } catch {
    return { ok: false, kind: "file_read" };
  }

  const prepared = prepareReceiptDataUrlForUpload(rawDataUrl);
  if (!prepared.ok) {
    if (prepared.error === "File too large") return { ok: false, kind: "file_too_large" };
    if (prepared.error === "Empty file") return { ok: false, kind: "empty_file" };
    if (prepared.error === "Unsupported file type") return { ok: false, kind: "unsupported_type" };
    return { ok: false, kind: "invalid_file" };
  }

  const fetchImpl = deps.fetchImpl || fetch;
  let uploadRes: Response;
  try {
    uploadRes = await fetchImpl("/api/upload-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: prepared.dataUrl, name: file.name }),
    });
  } catch {
    return { ok: false, kind: "network" };
  }

  const bodyText = await uploadRes.text();
  let uploadData: { path?: string; error?: string } = {};
  let jsonOk = false;
  try {
    uploadData = bodyText ? JSON.parse(bodyText) : {};
    jsonOk = true;
  } catch {
    uploadData = {};
  }

  if (!uploadRes.ok || !uploadData.path) {
    return {
      ok: false,
      kind: classifyReceiptUploadHttpFailure({
        status: uploadRes.status,
        error: uploadData.error,
        bodyText,
        jsonOk,
      }),
    };
  }

  return { ok: true, path: String(uploadData.path) };
}
