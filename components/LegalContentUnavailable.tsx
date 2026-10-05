/** Neutral empty-body safety state for legal CMS pages. Not legal policy text. */
export default function LegalContentUnavailable() {
  return (
    <div className="policy-section">
      <div className="highlight-box">
        <p>
          Policy content is currently unavailable. Please contact us if you need assistance.
        </p>
      </div>
    </div>
  );
}
