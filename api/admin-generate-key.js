const crypto = require("crypto");
const auth = require("./_auth");

const REPO = process.env.EDSA_AUTH_REPO || "cherentmolla27-byte/EDSA-academy";
const BRANCH = "main";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, private, max-age=0");
  res.end(JSON.stringify(body));
}

async function github(path, options = {}) {
  const token = process.env.EDSA_GITHUB_TOKEN;
  if (!token) throw new Error("EDSA_GITHUB_TOKEN is not configured");
  const r = await fetch("https://api.github.com" + path, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(data.message || "GitHub request failed");
    e.status = r.status;
    throw e;
  }
  return data;
}

async function readKeys() {
  try {
    const d = await github("/repos/" + REPO + "/contents/activation-keys.json?ref=" + BRANCH);
    return {
      keys: JSON.parse(Buffer.from(d.content || "", "base64").toString("utf8") || "[]"),
      sha: d.sha
    };
  } catch (e) {
    if (e.status === 404) return { keys: [], sha: null };
    throw e;
  }
}

async function writeKeys(keys, sha) {
  const content = Buffer.from(JSON.stringify(keys, null, 2) + "\n", "utf8").toString("base64");
  const body = { message: "Generate EDSA 500 ETB activation key(s)", content, branch: BRANCH };
  if (sha) body.sha = sha;
  return github("/repos/" + REPO + "/contents/activation-keys.json", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

  const session = auth.readSession(req, "admin");
  if (!session || session.role !== "admin") return json(res, 401, { ok: false, error: "Admin sign-in required." });

  try {
    const body = req.body || {};
    const rawScope = String(body.scope || "").trim();
    const scope = rawScope.toLowerCase() === "all" ? "all" : rawScope.toLowerCase();
    const count = Math.min(Math.max(Number(body.count) || 1, 1), 20);
    const allowed = ["smm", "dme", "pbm", "gdm", "fme", "dbi", "all"];
    if (!allowed.includes(scope)) return json(res, 400, { ok: false, error: "Invalid course scope." });

    // GitHub's contents API uses optimistic concurrency. Retry on a stale SHA
    // so simultaneous admin key generation does not fail the user request.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { keys, sha } = await readKeys();
      const created = [];
      const existing = new Set(keys.map(k => k.code));

      while (created.length < count) {
        const code = "EDSA-" + crypto.randomBytes(4).toString("hex").toUpperCase();
        if (existing.has(code)) continue;
        existing.add(code);
        created.push({
          code,
          scope,
          amount: 500,
          status: "active",
          createdAt: new Date().toISOString()
        });
      }

      try {
        await writeKeys(created.concat(keys), sha);
        return json(res, 200, { ok: true, keys: created });
      } catch (e) {
        if (e.status === 409 || e.status === 422) continue;
        throw e;
      }
    }

    return json(res, 409, { ok: false, error: "The activation registry changed repeatedly. Please try again." });
  } catch (e) {
    console.error("[EDSA generate key]", e);
    return json(res, e.status || 500, { ok: false, error: "Activation key could not be generated." });
  }
};
