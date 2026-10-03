const API_BASE = (process.env.SUPABASE_URL || "").replace(/\/$/, "") + "/rest/v1";

function getServerKey() {
  // Prefer the legacy service_role key when explicitly configured, then the
  // newer secret key. Both are backend-only elevated credentials that bypass RLS.
  // SUPABASE_SECRET_KEYS is supported as a JSON fallback for newer environments.
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.SUPABASE_SECRET_KEY) return process.env.SUPABASE_SECRET_KEY;
  try {
    const keys = JSON.parse(process.env.SUPABASE_SECRET_KEYS || "{}");
    if (keys && typeof keys === "object" && keys.default) return keys.default;
  } catch (_) {}
  return "";
}

const SECRET = getServerKey();

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
      Authorization: "Bearer " + SECRET,
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
