/**
 * Shared INSERT tuple parser / quote-aware SQL scanner for F4UK off-site backups.
 * Counts rows only in verify paths — never used to print row values.
 */
"use strict";

/**
 * Legacy regex used before OFFSITE-120. Ends at the first ';' even inside quotes.
 * Kept only so tests can reproduce the OFFSITE-119 undercount.
 */
const LEGACY_INSERT_RE =
  /INSERT INTO `([^`]+)` \(([^)]+)\) VALUES\n([\s\S]*?);/g;

/** Walk one VALUES body and return row objects (quote-aware). */
function parseValuesBody(cols, body) {
  const rows = [];
  let i = 0;
  const text = String(body).trim();
  while (i < text.length) {
    while (i < text.length && (text[i] === "," || /\s/.test(text[i]))) i++;
    if (i >= text.length) break;
    if (text[i] !== "(") throw new Error("expected ( at " + i);
    i++;
    const vals = [];
    while (i < text.length && text[i] !== ")") {
      while (i < text.length && /\s/.test(text[i])) i++;
      if (text.startsWith("NULL", i)) {
        vals.push(null);
        i += 4;
      } else if (text[i] === "'" || (text[i] === "N" && text[i + 1] === "'")) {
        // mysql.escape may produce _utf8mb4'...' — handle quoted strings
        let startQuote = text.indexOf("'", i);
        i = startQuote + 1;
        let s = "";
        while (i < text.length) {
          if (text[i] === "\\" && i + 1 < text.length) {
            s += text[i] + text[i + 1];
            i += 2;
            continue;
          }
          if (text[i] === "'") {
            if (text[i + 1] === "'") {
              s += "''";
              i += 2;
              continue;
            }
            i++;
            break;
          }
          s += text[i++];
        }
        // Unescape mysql string literals (\\ first via placeholder)
        const un = s
          .replace(/\\\\/g, "\u0000")
          .replace(/\\'/g, "'")
          .replace(/\\"/g, '"')
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\0/g, "\0")
          .replace(/\\Z/g, "\x1a")
          .replace(/\u0000/g, "\\")
          .replace(/''/g, "'");
        vals.push(un);
      } else if (text[i] === "X" && text[i + 1] === "'") {
        i += 2;
        let hex = "";
        while (i < text.length && text[i] !== "'") hex += text[i++];
        i++; // closing '
        vals.push(Buffer.from(hex, "hex"));
      } else {
        let num = "";
        while (i < text.length && /[0-9.eE+-]/.test(text[i])) num += text[i++];
        vals.push(num.includes(".") ? Number(num) : num);
      }
      while (i < text.length && /\s/.test(text[i])) i++;
      if (text[i] === ",") i++;
    }
    if (text[i] === ")") i++;
    const obj = {};
    cols.forEach((c, idx) => {
      obj[c] = vals[idx];
    });
    rows.push(obj);
  }
  return rows;
}

/** Count top-level value tuples in a VALUES body (quote-aware; no row values). */
function countTuplesInValuesBody(body) {
  let count = 0;
  let i = 0;
  const text = String(body);
  let state = "normal"; // normal | sq | bt
  let escape = false;
  let depth = 0;

  while (i < text.length) {
    const c = text[i];
    const n = i + 1 < text.length ? text[i + 1] : "";

    if (state === "sq") {
      if (escape) {
        escape = false;
        i++;
        continue;
      }
      if (c === "\\") {
        escape = true;
        i++;
        continue;
      }
      if (c === "'") {
        if (n === "'") {
          i += 2;
          continue;
        }
        state = "normal";
        i++;
        continue;
      }
      i++;
      continue;
    }

    if (state === "bt") {
      if (c === "`") {
        if (n === "`") {
          i += 2;
          continue;
        }
        state = "normal";
        i++;
        continue;
      }
      i++;
      continue;
    }

    // normal
    if (c === "'") {
      state = "sq";
      i++;
      continue;
    }
    if (c === "`") {
      state = "bt";
      i++;
      continue;
    }
    if (c === "(") {
      if (depth === 0) count++;
      depth++;
      i++;
      continue;
    }
    if (c === ")") {
      if (depth > 0) depth--;
      i++;
      continue;
    }
    i++;
  }
  return count;
}

/**
 * Streaming quote-aware statement scanner.
 * Tracks single-quoted strings (\\ escapes + ''), backtick ids, -- and /* comments.
 * Invokes onStatement(stmt) when ';' is seen outside quotes/comments.
 */
function createStatementScanner(onStatement) {
  let state = "normal"; // normal | sq | bt | line_comment | block_comment
  let escape = false;
  let buf = "";

  function write(chunk) {
    const str = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      const n = i + 1 < str.length ? str[i + 1] : "";

      if (state === "line_comment") {
        buf += c;
        if (c === "\n" || c === "\r") state = "normal";
        continue;
      }

      if (state === "block_comment") {
        buf += c;
        if (c === "*" && n === "/") {
          buf += "/";
          i++;
          state = "normal";
        }
        continue;
      }

      if (state === "sq") {
        buf += c;
        if (escape) {
          escape = false;
          continue;
        }
        if (c === "\\") {
          escape = true;
          continue;
        }
        if (c === "'") {
          if (n === "'") {
            buf += "'";
            i++;
            continue;
          }
          state = "normal";
        }
        continue;
      }

      if (state === "bt") {
        buf += c;
        if (c === "`") {
          if (n === "`") {
            buf += "`";
            i++;
            continue;
          }
          state = "normal";
        }
        continue;
      }

      // normal
      if (c === "'") {
        buf += c;
        state = "sq";
        continue;
      }
      if (c === "`") {
        buf += c;
        state = "bt";
        continue;
      }
      // MySQL line comment: -- followed by whitespace (or end)
      if (c === "-" && n === "-") {
        const after = i + 2 < str.length ? str[i + 2] : " ";
        if (after === " " || after === "\t" || after === "\n" || after === "\r" || after === "") {
          buf += "--";
          i++;
          state = "line_comment";
          continue;
        }
      }
      if (c === "/" && n === "*") {
        buf += "/*";
        i++;
        state = "block_comment";
        continue;
      }
      if (c === ";") {
        buf += ";";
        onStatement(buf);
        buf = "";
        continue;
      }
      buf += c;
    }
  }

  function end() {
    if (buf.length && buf.trim().length) {
      onStatement(buf);
    }
    buf = "";
  }

  return { write, end, getPending: () => buf };
}

const INSERT_HEAD_RE =
  /^\s*INSERT\s+INTO\s+`([^`]+)`\s*\(([^)]+)\)\s*VALUES\s*/i;

function parseInsertStatement(stmt) {
  const m = INSERT_HEAD_RE.exec(stmt);
  if (!m) return null;
  const table = m[1];
  const cols = m[2].split(",").map((c) => c.replace(/`/g, "").trim());
  let body = stmt.slice(m[0].length);
  // Strip trailing ';' and whitespace
  body = body.replace(/;\s*$/, "").trim();
  return { table, cols, body };
}

/** Minimal parser for INSERT value tuples produced by our dumper. */
function parseInsertTuples(sql) {
  const inserts = [];
  const scanner = createStatementScanner((stmt) => {
    const parsed = parseInsertStatement(stmt);
    if (!parsed) return;
    const rows = parseValuesBody(parsed.cols, parsed.body);
    inserts.push({ table: parsed.table, cols: parsed.cols, rows });
  });
  scanner.write(sql);
  scanner.end();
  return inserts;
}

/**
 * Streaming INSERT row counter. Feed gunzip chunks; state survives mid-string boundaries.
 */
function createInsertRowCounter() {
  const tables = Object.create(null);
  const scanner = createStatementScanner((stmt) => {
    const parsed = parseInsertStatement(stmt);
    if (!parsed) return;
    const n = countTuplesInValuesBody(parsed.body);
    tables[parsed.table] = (tables[parsed.table] || 0) + n;
  });
  return {
    write(chunk) {
      scanner.write(chunk);
      return this;
    },
    end() {
      scanner.end();
      return { ...tables };
    },
    /** @deprecated internal peek */
    _tables: tables,
  };
}

/** Aggregate INSERT row counts per table (no row values returned). */
function countRowsByTable(sql) {
  const counter = createInsertRowCounter();
  counter.write(sql);
  return counter.end();
}

/** Legacy regex counter — reproduces OFFSITE-119 undercount on ';' inside strings. */
function countRowsByTableLegacyRegex(sql) {
  const tables = Object.create(null);
  const re = new RegExp(LEGACY_INSERT_RE.source, "g");
  let m;
  while ((m = re.exec(sql))) {
    const table = m[1];
    const body = m[3];
    let n;
    try {
      n = countTuplesInValuesBody(body);
    } catch {
      n = 0;
    }
    tables[table] = (tables[table] || 0) + n;
  }
  return tables;
}

function countSqlForbidden(sql) {
  const s = String(sql);
  return {
    use_database: (s.match(/\bUSE\s+/gi) || []).length,
    create_database: (s.match(/\bCREATE\s+DATABASE\b/gi) || []).length,
    definer: (s.match(/\bDEFINER\b/gi) || []).length,
  };
}

module.exports = {
  parseInsertTuples,
  countRowsByTable,
  countRowsByTableLegacyRegex,
  countTuplesInValuesBody,
  createStatementScanner,
  createInsertRowCounter,
  countSqlForbidden,
  LEGACY_INSERT_RE,
};
