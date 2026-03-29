import type { MakeVoidConfig } from "../types.js";

export function generateDbModule(config: MakeVoidConfig, isDev: boolean): string {
  const bindingName = config.bindings?.d1 ?? "DB";

  if (isDev) {
    // Dev mode: in-memory tables backed by simple Maps
    return `
const tables = new Map();

function getTable(name) {
  if (!tables.has(name)) tables.set(name, []);
  return tables.get(name);
}

function parseQuery(query, bindings) {
  const q = query.trim().replace(/\\s+/g, " ");
  const upper = q.toUpperCase();

  // INSERT INTO table (...) VALUES (...)
  const insertMatch = q.match(/INSERT\\s+INTO\\s+(\\w+)\\s*\\(([^)]+)\\)\\s*VALUES\\s*\\(([^)]+)\\)/i);
  if (insertMatch) {
    const table = getTable(insertMatch[1]);
    const cols = insertMatch[2].split(",").map(c => c.trim());
    const row = {};
    cols.forEach((col, i) => { row[col] = bindings[i] ?? null; });
    row.id = row.id ?? table.length + 1;
    table.push(row);
    return { results: [row], success: true, meta: { changes: 1 } };
  }

  // SELECT ... FROM table (with optional WHERE col = ?)
  const selectMatch = q.match(/SELECT\\s+(.+?)\\s+FROM\\s+(\\w+)(?:\\s+WHERE\\s+(.+))?/i);
  if (selectMatch) {
    const cols = selectMatch[1];
    const table = getTable(selectMatch[2]);
    let rows = [...table];

    if (selectMatch[3]) {
      const whereParts = selectMatch[3].match(/(\\w+)\\s*=\\s*\\?/);
      if (whereParts && bindings.length > 0) {
        const col = whereParts[1];
        const val = bindings[0];
        rows = rows.filter(r => String(r[col]) === String(val));
      }
    }

    // Handle count(*)
    if (cols.match(/count\\s*\\(\\s*\\*\\s*\\)/i)) {
      const alias = cols.match(/as\\s+(\\w+)/i)?.[1] ?? "count";
      return { results: [{ [alias]: rows.length }], success: true, meta: {} };
    }

    // Project columns
    if (cols.trim() !== "*") {
      const names = cols.split(",").map(c => c.trim());
      rows = rows.map(r => {
        const out = {};
        names.forEach(n => { out[n] = r[n] ?? null; });
        return out;
      });
    }

    return { results: rows, success: true, meta: {} };
  }

  // DELETE FROM table WHERE ...
  const deleteMatch = q.match(/DELETE\\s+FROM\\s+(\\w+)/i);
  if (deleteMatch) {
    const name = deleteMatch[1];
    const before = getTable(name).length;
    tables.set(name, []);
    return { results: [], success: true, meta: { changes: before } };
  }

  console.log("[make-void/db] unhandled query:", q, bindings);
  return { results: [], success: true, meta: {} };
}

class MockStatement {
  constructor(query, bindings = []) {
    this._query = query;
    this._bindings = bindings;
  }
  bind(...values) {
    return new MockStatement(this._query, values);
  }
  async all() {
    return parseQuery(this._query, this._bindings);
  }
  async first(col) {
    const { results } = parseQuery(this._query, this._bindings);
    if (!results.length) return null;
    return col ? results[0][col] : results[0];
  }
  async run() {
    return parseQuery(this._query, this._bindings);
  }
}

const mockD1 = {
  prepare(query) { return new MockStatement(query); },
  dump() { return Promise.resolve(new ArrayBuffer(0)); },
  batch(stmts) { return Promise.all(stmts.map(s => s.all())); },
  exec(query) {
    return Promise.resolve(parseQuery(query, []));
  },
};

export async function sql(strings, ...values) {
  const query = strings.reduce((acc, str, i) => acc + str + (i < values.length ? "?" : ""), "");
  return mockD1.prepare(query).bind(...values).all();
}

export const db = mockD1;
`;
  }

  return `
import { env } from "cloudflare:workers";

export async function sql(strings, ...values) {
  const query = strings.reduce((acc, str, i) => acc + str + (i < values.length ? "?" : ""), "");
  return env.${bindingName}.prepare(query).bind(...values).all();
}

export const db = new Proxy({}, {
  get(_, prop) {
    return Reflect.get(env.${bindingName}, prop);
  }
});
`;
}
