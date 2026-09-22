const auth = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return auth.json(res, 405, { ok: false, error: "Method not allowed" });
  const configuredPin = process.env.EDSA_ADMIN_PIN || "";
  if (!configuredPin) return auth.json(res, 503, { ok: false, error: "Admin authentication is not configured. Add EDSA_ADMIN_PIN in Vercel." });
  const pin = String((req.body || {}).pin || "").trim();
  if (!pin || pin !== configuredPin) return auth.json(res, 401, { ok: false, error: "Incorrect admin PIN." });
  try {
    const token = auth.createSession({ email: "admin", name: "EDSA Administrator", role: "admin" });
    auth.setSessionCookie(res, token);
    return auth.json(res, 200, { ok: true, role: "admin" });
  } catch (err) {
    console.error("[EDSA admin login]", err);
    return auth.json(res, 503, { ok: false, error: "Admin authentication is not configured correctly." });
  }
};
