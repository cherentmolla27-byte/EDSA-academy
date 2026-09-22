const auth = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return auth.json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    const body = req.body || {};
    const email = auth.normalizeEmail(body.email);
    const password = body.password;
    if (!email || !password) return auth.json(res, 400, { ok: false, error: "Email and password are required." });

    const { users } = await auth.readUsers();
    const user = users[email];
    if (!user || !(await auth.verifyPassword(password, user.passwordHash))) {
      return auth.json(res, 401, { ok: false, error: "Invalid email or password." });
    }

    const token = auth.createSession({ email, name: user.name });
    auth.setSessionCookie(res, token);
    return auth.json(res, 200, { ok: true, user: { name: user.name, email: user.email, createdAt: user.createdAt } });
  } catch (err) {
    console.error("[EDSA auth login]", err);
    return auth.json(res, 500, { ok: false, error: "Sign-in is temporarily unavailable." });
  }
};
