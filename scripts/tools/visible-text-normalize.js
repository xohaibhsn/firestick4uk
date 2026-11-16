/**
 * Visible-text normaliser for anonymous capture/compare.
 * Countdown digits/cells, mini-cart money inside [[MC]] only, relative dates —
 * product prices outside [[MC]] stay intact.
 */
"use strict";

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeVisibleText(raw) {
  let t = String(raw || "");
  t = t.replace(
    /\b((?:Offer\s+)?(?:Ends|Starts|Opens)\s+in)\s+\d+\s+days?(?:\s+\d+\s+hours?)?(?:\s+\d+\s+minutes?)?(?:\s+\d+\s+seconds?)?/gi,
    "$1 # days # hours # minutes # seconds"
  );
  t = t.replace(
    /\b((?:Ends|Starts|Opens)\s+in)\s+\d+\s*d(?:\s+\d{1,2}:\d{2}:\d{2})?/gi,
    "$1 #d #:#:#"
  );
  t = t.replace(
    /\b((?:Ends|Starts|Opens)\s+in)\s+\d{1,2}:\d{2}:\d{2}/gi,
    "$1 #:#:#"
  );
  t = t.replace(
    /\b\d{1,3}\s*[\r\n]+\s*(DAYS?|HRS?|HOURS?|MINS?|MINUTES?|SECS?|SECONDS?)\b/gi,
    "#\n$1"
  );
  t = t.replace(/\b\d{1,2}\s*h\b/gi, "#h");
  t = t.replace(/\b\d{1,2}\s*m\b/gi, "#m");
  t = t.replace(/\b\d{1,2}\s*s\b/gi, "#s");
  t = t.replace(/\b\d+\s*d\b/gi, "#d");
  t = t.replace(
    /\b\d+\s+(seconds?|minutes?|hours?|days?|weeks?)\s+ago\b/gi,
    "# $1 ago"
  );
  t = t.replace(/\b(yesterday|today|tomorrow)\b/gi, "#rel");
  t = t.replace(/\[\[MC\]\]([\s\S]*?)\[\[\/MC\]\]/g, (_m, inner) => {
    return (
      "[[MC]]" +
      String(inner).replace(/£\d+(?:\.\d{1,2})?/g, "£#.##") +
      "[[/MC]]"
    );
  });
  return t;
}

/** Function source for page.evaluate injection (must stay identical to normalizeVisibleText). */
const NORMALIZE_VISIBLE_TEXT_SOURCE = normalizeVisibleText.toString();

module.exports = {
  normalizeVisibleText,
  NORMALIZE_VISIBLE_TEXT_SOURCE,
};
