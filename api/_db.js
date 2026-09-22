const API_BASE = (process.env.SUPABASE_URL || "").replace(/\/$/, "") + "/rest/v1";
const SECRET = process.env.SUPABASE_SECRET_KEY || "";

function dbConfigured() {
  return Boolean(process.env.SUPABASE_URL && SECRET);
}

async function supabaseRequest(path, options = {}) {
  if (!dbConfigured()) {
    const err = new Error("Supabase database is not configured");
    err.status = 503;
    throw err;
  }

  const response = await fetch(API_BASE + path, {
    ...options,
    headers: {
      apikey: SECRET,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }

  if (!response.ok) {
    const message = data && (data.message || data.error || data.hint) || "Supabase request failed";
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function upsert(table, rows, onConflict) {
  const payload = Array.isArray(rows) ? rows : [rows];
  if (!payload.length) return [];
  const query = onConflict ? "?on_conflict=" + encodeURIComponent(onConflict) : "";
  return supabaseRequest("/" + table + query, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload)
  });
}

async function select(table, query) {
  return supabaseRequest("/" + table + (query ? "?" + query : ""), { method: "GET" });
}

module.exports = { dbConfigured, supabaseRequest, upsert, select };
