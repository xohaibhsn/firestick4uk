/**
 * Shared INSERT tuple parser for F4UK off-site backup dumps.
 * Counts rows only — never used to print row values.
 */
"use strict";

/** Minimal parser for INSERT value tuples produced by our dumper. */
function parseInsertTuples(sql) {
  const inserts = [];
  const re =
    /INSERT INTO `([^`]+)` \(([^)]+)\) VALUES\n([\s\S]*?);/g;
  let m;
  while ((m = re.exec(sql))) {
    const table = m[1];
    const cols = m[2].split(",").map((c) => c.replace(/`/g, "").trim());
    const body = m[3].trim();
    const rows = [];
    let i = 0;
    while (i < body.length) {
      while (i < body.length && (body[i] === "," || /\s/.test(body[i]))) i++;
      if (i >= body.length) break;
      if (body[i] !== "(") throw new Error("expected ( at " + i);
      i++;
      const vals = [];
      while (i < body.length && body[i] !== ")") {
        while (i < body.length && /\s/.test(body[i])) i++;
        if (body.startsWith("NULL", i)) {
          vals.push(null);
          i += 4;
        } else if (body[i] === "'" || (body[i] === "N" && body[i + 1] === "'")) {
          // mysql.escape may produce _utf8mb4'...' — handle quoted strings
          let startQuote = body.indexOf("'", i);
          i = startQuote + 1;
          let s = "";
          while (i < body.length) {
            if (body[i] === "\\" && i + 1 < body.length) {
              s += body[i] + body[i + 1];
              i += 2;
              continue;
            }
            if (body[i] === "'") {
              if (body[i + 1] === "'") {
                s += "''";
                i += 2;
                continue;
              }
              i++;
              break;
            }
            s += body[i++];
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
        } else if (body[i] === "X" && body[i + 1] === "'") {
          i += 2;
          let hex = "";
          while (i < body.length && body[i] !== "'") hex += body[i++];
          i++; // closing '
          vals.push(Buffer.from(hex, "hex"));
        } else {
          let num = "";
          while (i < body.length && /[0-9.eE+-]/.test(body[i])) num += body[i++];
          vals.push(num.includes(".") ? Number(num) : num);
        }
        while (i < body.length && /\s/.test(body[i])) i++;
        if (body[i] === ",") i++;
      }
      if (body[i] === ")") i++;
      const obj = {};
      cols.forEach((c, idx) => {
        obj[c] = vals[idx];
      });
      rows.push(obj);
    }
    inserts.push({ table, cols, rows });
  }
  return inserts;
}

/** Aggregate INSERT row counts per table (no row values returned). */
function countRowsByTable(sql) {
  const inserts = parseInsertTuples(sql);
  const tables = {};
  for (const ins of inserts) {
    tables[ins.table] = (tables[ins.table] || 0) + ins.rows.length;
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
  countSqlForbidden,
};
