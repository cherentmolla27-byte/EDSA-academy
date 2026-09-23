const {
  json, readUsers, writeUsers, normalizeEmail, validateName, validatePassword,
  hashPassword, createSession, setSessionCookie
} = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    const body = req.body || {};
    const name = validateName(body.name);
    const email = normalizeEmail(body.email);
    const password = body.password;

    if (name.length < 2) return json(res, 400, { ok: false, error: "Please enter your full name." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { ok: false, error: "Please enter a valid email address." });
    if (!validatePassword(password)) return json(res, 400, { ok: false, error: "Password must be 8–128 characters." });

    const { users, sha } = await readUsers();
    if (users[email]) return json(res, 409, { ok: false, error: "An EDSA account already exists for this email." });

    users[email] = {
      name,
      email,
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString()
    };
    await writeUsers(users, sha, "Register EDSA student account");

    const token = createSession({ email, name, role: "student" });
    setSessionCookie(res, token);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return json(res, 201, { ok: true, authenticated: true, user: { name, email, role: "student", createdAt: users[email].createdAt } });
  } catch (err) {
    console.error("[EDSA auth register]", err);
    return json(res, 500, { ok: false, error: "Account registration is temporarily unavailable." });
  }
};
