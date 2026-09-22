const auth = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return auth.json(res, 405, { ok: false, error: "Method not allowed" });
  const session = auth.readSession(req);
  if (!session || session.role !== "admin") return auth.json(res, 401, { ok: false, authenticated: false });
  return auth.json(res, 200, { ok: true, authenticated: true, role: "admin" });
};
