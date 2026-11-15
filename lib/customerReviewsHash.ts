/** Node-only SHA-256 for review duplicate guard. Do not import from client components. */
import { createHash } from "crypto";
import { normaliseReviewTextForHash } from "./customerReviews";

export function reviewTextHash(text: string): string {
  const normalised = normaliseReviewTextForHash(text);
  return createHash("sha256").update(normalised, "utf8").digest("hex");
}
