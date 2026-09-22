const auth = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return auth.json(res, 405, { ok: false, error: "Method not allowed" });
  auth.clearSessionCookie(res);
  return auth.json(res, 200, { ok: true });
};
