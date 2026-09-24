const crypto = require("crypto");
const auth = require("./_auth");
const db = require("./_db");

const REPO = process.env.EDSA_AUTH_REPO || "cherentmolla27-byte/EDSA-academy";
const REPO_CERT = process.env.EDSA_GITHUB_REPOSITORY || "cherentmolla27-byte/EDSA-academy";
const BRANCH = "main";

function cleanText(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}
function asInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function requireRole(req, role) {
  const session = auth.readSession(req);
  if (!session || (role && session.role !== role)) return null;
  return session;
}
function method(req, res, allowed) {
  if (!allowed.includes(req.method)) {
    res.setHeader("Allow", allowed.join(", "));
    auth.json(res, 405, { ok: false, error: "Method not allowed" });
    return false;
  }
  return true;
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

async function readJsonFile(path, fallback) {
  try {
    const d = await github("/repos/" + REPO + "/contents/" + path + "?ref=" + BRANCH);
    return {
      data: JSON.parse(Buffer.from(d.content || "", "base64").toString("utf8") || JSON.stringify(fallback)),
      sha: d.sha
    };
  } catch (e) {
    if (e.status === 404) return { data: fallback, sha: null };
    throw e;
  }
}
async function writeJsonFile(path, data, sha, message) {
  const content = Buffer.from(JSON.stringify(data, null, 2) + "\n", "utf8").toString("base64");
  const body = { message, content, branch: BRANCH };
  if (sha) body.sha = sha;
  return github("/repos/" + REPO + "/contents/" + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function authLogin(req, res) {
  if (!method(req, res, ["POST"])) return;
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
    const token = auth.createSession({ email, name: user.name, role: "student" });
    auth.setSessionCookie(res, token);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return auth.json(res, 200, { ok: true, authenticated: true, user: { name: user.name, email: user.email, role: "student", createdAt: user.createdAt } });
  } catch (err) {
    console.error("[EDSA auth login]", err);
    return auth.json(res, 500, { ok: false, error: "Sign-in is temporarily unavailable." });
  }
}

async function authRegister(req, res) {
  if (!method(req, res, ["POST"])) return;
  try {
    const body = req.body || {};
    const name = auth.validateName(body.name);
    const email = auth.normalizeEmail(body.email);
    const password = body.password;
    if (name.length < 2) return auth.json(res, 400, { ok: false, error: "Please enter your full name." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return auth.json(res, 400, { ok: false, error: "Please enter a valid email address." });
    if (!auth.validatePassword(password)) return auth.json(res, 400, { ok: false, error: "Password must be 8–128 characters." });
    const { users, sha } = await auth.readUsers();
    if (users[email]) return auth.json(res, 409, { ok: false, error: "An EDSA account already exists for this email." });
    users[email] = { name, email, passwordHash: await auth.hashPassword(password), createdAt: new Date().toISOString() };
    await auth.writeUsers(users, sha, "Register EDSA student account");
    const token = auth.createSession({ email, name, role: "student" });
    auth.setSessionCookie(res, token);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return auth.json(res, 201, { ok: true, authenticated: true, user: { name, email, role: "student", createdAt: users[email].createdAt } });
  } catch (err) {
    console.error("[EDSA auth register]", err);
    return auth.json(res, 500, { ok: false, error: "Account registration is temporarily unavailable." });
  }
}

async function authMe(req, res) {
  if (!method(req, res, ["GET"])) return;
  const session = auth.readSession(req);
  if (!session) return auth.json(res, 401, { ok: false, authenticated: false });
  return auth.json(res, 200, { ok: true, authenticated: true, user: { name: session.name, email: session.email, role: session.role || "student" } });
}
async function authLogout(req, res) {
  if (!method(req, res, ["POST"])) return;
  auth.clearSessionCookie(res);
  return auth.json(res, 200, { ok: true });
}
async function adminLogin(req, res) {
  if (!method(req, res, ["POST"])) return;
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
}
async function adminMe(req, res) {
  if (!method(req, res, ["GET"])) return;
  const session = auth.readSession(req);
  if (!session || session.role !== "admin") return auth.json(res, 401, { ok: false, authenticated: false });
  return auth.json(res, 200, { ok: true, authenticated: true, role: "admin" });
}

async function activateKey(req, res) {
  if (!method(req, res, ["POST"])) return;
  const s = requireRole(req, "student");
  if (!s) return auth.json(res, 401, { ok: false, error: "Student sign-in required." });
  try {
    const code = String((req.body || {}).code || "").trim().toUpperCase();
    const courseId = String((req.body || {}).courseId || "").trim();
    if (!/^EDSA-[A-F0-9]{8}$/.test(code)) return auth.json(res, 400, { ok: false, error: "Invalid activation key." });
    const { data: keys, sha } = await readJsonFile("activation-keys.json", []);
    const key = keys.find(k => k.code === code);
    if (!key) return auth.json(res, 404, { ok: false, error: "Invalid activation key." });
    if (key.status !== "active") return auth.json(res, 409, { ok: false, error: "This activation key has already been used." });
    if (key.amount !== 500) return auth.json(res, 409, { ok: false, error: "This key is not valid for the current 500 ETB fee." });
    if (!courseId || key.scope !== courseId) return auth.json(res, 409, { ok: false, error: "This 500 ETB key is for a different course." });
    key.status = "used"; key.usedAt = new Date().toISOString(); key.usedBy = s.name || "Student"; key.usedEmail = s.email; key.usedCourse = courseId;
    await writeJsonFile("activation-keys.json", keys, sha, "Activate EDSA 500 ETB key");
    return auth.json(res, 200, { ok: true, activated: true, amount: 500, courseId });
  } catch (e) {
    console.error("[EDSA activate key]", e);
    return auth.json(res, e.status || 500, { ok: false, error: "Activation could not be completed. Please try again." });
  }
}

async function adminGenerateKey(req, res) {
  if (!method(req, res, ["POST"])) return;
  const session = requireRole(req, "admin");
  if (!session) return auth.json(res, 401, { ok: false, error: "Admin sign-in required." });
  try {
    const body = req.body || {};
    const scope = String(body.scope || "").trim();
    const count = Math.min(Math.max(Number(body.count) || 1, 1), 20);
    const allowed = ["smm", "dme", "pbm", "gdm", "fme", "dbi"];
    if (!allowed.includes(scope)) return auth.json(res, 400, { ok: false, error: "Invalid course scope." });
    const { data: keys, sha } = await readJsonFile("activation-keys.json", []);
    const created = [];
    for (let i = 0; i < count; i++) {
      const code = "EDSA-" + crypto.randomBytes(4).toString("hex").toUpperCase();
      const key = { code, scope, amount: 500, status: "active", createdAt: new Date().toISOString() };
      keys.unshift(key); created.push(key);
    }
    await writeJsonFile("activation-keys.json", keys, sha, "Generate EDSA 500 ETB activation key(s)");
    return auth.json(res, 200, { ok: true, keys: created });
  } catch (e) {
    console.error("[EDSA generate key]", e);
    return auth.json(res, e.status || 500, { ok: false, error: "Activation key could not be generated." });
  }
}

async function courseAccess(req, res) {
  if (!method(req, res, ["GET"])) return;
  const s = requireRole(req, "student");
  if (!s) return auth.json(res, 401, { ok: false, error: "Student sign-in required." });
  try {
    const courseId = String((req.query && req.query.courseId) || "").trim().toLowerCase();
    if (!courseId) return auth.json(res, 400, { ok: false, error: "Course is required." });
    const email = auth.normalizeEmail(s.email);
    const { data: keys } = await readJsonFile("activation-keys.json", []);
    const unlocked = keys.some(k => k.status === "used" && k.amount === 500 && auth.normalizeEmail(k.usedEmail) === email && k.scope === courseId && k.usedCourse === courseId);
    if (!unlocked) return auth.json(res, 200, { ok: true, unlocked: false, courseId });
    if (String((req.query && req.query.include) || "") !== "lessons") return auth.json(res, 200, { ok: true, unlocked: true, courseId });
    const r = await fetch("https://xcdezvnnkahdogywllkk.supabase.co/functions/v1/edsa-course-lessons?courseId=" + encodeURIComponent(courseId), {
      headers: { cookie: String(req.headers.cookie || ""), accept: "application/json" }, cache: "no-store"
    });
    const body = await r.json().catch(() => ({ ok: false, error: "Invalid protected course response." }));
    res.setHeader("Cache-Control", "no-store, private");
    return auth.json(res, r.status, { ...body, unlocked: true });
  } catch (e) {
    console.error("[EDSA course access]", e);
    return auth.json(res, e.status || 500, { ok: false, error: "Course access could not be checked." });
  }
}

async function studentSync(req, res) {
  if (!method(req, res, ["GET", "POST"])) return;
  const session = requireRole(req, "student");
  if (!session) return auth.json(res, 401, { ok: false, error: "Student sign-in required." });
  if (!db.dbConfigured()) return auth.json(res, 503, { ok: false, error: "Student database is not configured yet." });
  const email = auth.normalizeEmail(session.email);
  const name = auth.validateName(session.name);
  try {
    if (req.method === "GET") {
      const students = await db.select("students", "select=*&email=eq." + encodeURIComponent(email) + "&limit=1");
      if (!students.length) return auth.json(res, 200, { ok: true, student: null, progress: [], certificates: [] });
      const student = students[0];
      const progress = await db.select("course_progress", "select=*&student_id=eq." + encodeURIComponent(student.id) + "&order=updated_at.desc");
      const certificates = await db.select("certificates", "select=*&student_id=eq." + encodeURIComponent(student.id) + "&order=issue_date.desc");
      return auth.json(res, 200, { ok: true, student, progress, certificates });
    }
    const body = req.body || {};
    const profile = body.profile || {};
    const journey = body.journey && typeof body.journey === "object" ? body.journey : {};
    const certificates = body.certificates && typeof body.certificates === "object" ? body.certificates : {};
    const studentRows = await db.upsert("students", { email, full_name: name || cleanText(profile.name, 120) || "EDSA Student", updated_at: new Date().toISOString() }, "email");
    const student = studentRows[0];
    if (!student) throw new Error("Student record could not be created.");
    const courseRows = [];
    const studentJourney = journey[email] || journey[session.email] || journey[Object.keys(journey)[0]];
    if (studentJourney && studentJourney.courses && typeof studentJourney.courses === "object") {
      Object.entries(studentJourney.courses).forEach(([courseId, item]) => {
        if (!item || typeof item !== "object") return;
        courseRows.push({
          student_id: student.id, course_id: cleanText(courseId, 100),
          course_title: cleanText(item.courseTitle || item.title || courseId, 200),
          attempts: Math.max(0, Number(item.attempts || 0)),
          passed: item.status === "passed" || item.passed === true,
          best_score: asInt(item.bestScore),
          latest_score: asInt(item.lastScore != null ? item.lastScore : item.latestScore),
          latest_status: cleanText(item.status || item.latestStatus, 40) || null,
          last_attempt_at: item.lastAttempt || item.lastAttemptAt || null,
          certificate_id: cleanText(item.certificateId, 120) || null,
          updated_at: new Date().toISOString()
        });
      });
    }
    if (courseRows.length) await db.upsert("course_progress", courseRows, "student_id,course_id");
    const certificateRows = Object.values(certificates).filter(r => r && r.id).map(r => ({
      certificate_id: cleanText(r.id, 120), student_id: student.id,
      student_name: cleanText(r.name || name, 120) || name || "EDSA Student",
      course_id: cleanText(r.courseId || r.course_id || r.course, 100) || "unknown",
      course_title: cleanText(r.courseTitle || r.course || "EDSA Course", 200),
      score: asInt(r.score), issue_date: String(r.issueDate || new Date().toISOString()).slice(0, 10),
      status: cleanText(r.status || "Valid", 40),
      verification_url: cleanText(r.verificationUrl || r.verification_url, 500) || null,
      issued_by: cleanText(r.issuedBy || "Ethiopian Digital Skills Academy", 200)
    }));
    if (certificateRows.length) await db.upsert("certificates", certificateRows, "certificate_id");
    return auth.json(res, 200, { ok: true, synced: { student: true, progress: courseRows.length, certificates: certificateRows.length } });
  } catch (err) {
    console.error("[EDSA student sync]", err);
    return auth.json(res, err.status || 500, { ok: false, error: "Student database sync failed." });
  }
}

async function examAttempt(req, res) {
  if (!method(req, res, ["POST"])) return;
  const session = requireRole(req, "student");
  if (!session) return auth.json(res, 401, { ok: false, error: "Please sign in before submitting an exam." });
  if (!db.dbConfigured()) return auth.json(res, 503, { ok: false, error: "Student database is not configured yet." });
  try {
    const body = req.body || {};
    const courseTitle = cleanText(body.courseTitle, 200) || "EDSA Course";
    const courseId = cleanText(body.courseId, 100) || ({
      "Social Media Management": "smm", "Digital Marketing Essentials": "dme",
      "Project & Business Management": "pbm", "Graphic Design for Marketers": "gdm",
      "Financial Management": "fme", "Data Analysis & BI": "dbi"
    }[courseTitle] || courseTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100));
    const score = asInt(body.score);
    const passed = body.passed === true || (score != null && score >= 80);
    const startedAt = body.startedAt ? new Date(body.startedAt).toISOString() : new Date().toISOString();
    const completedAt = body.completedAt ? new Date(body.completedAt).toISOString() : new Date().toISOString();
    if (!courseId || score == null || score < 0 || score > 100) return auth.json(res, 400, { ok: false, error: "Valid course and score are required." });
    const email = auth.normalizeEmail(session.email);
    const { data: keys } = await readJsonFile("activation-keys.json", []);
    const courseKey = keys.find(k => k.status === "used" && k.amount === 500 && auth.normalizeEmail(k.usedEmail) === email && k.scope === courseId && k.usedCourse === courseId);
    if (!courseKey) return auth.json(res, 403, { ok: false, error: "This course exam requires an active 500 ETB course access. Please purchase or activate this course first." });
    const studentLookup = await db.select("students", "select=id&email=eq." + encodeURIComponent(email) + "&limit=1");
    const studentId = studentLookup[0]?.id;
    const previousAttempts = studentId ? await db.select("exam_attempts", "select=id,score,passed,created_at&student_id=eq." + encodeURIComponent(studentId) + "&course_id=eq." + encodeURIComponent(courseId) + "&order=created_at.desc&limit=1") : [];
    const lastAttempt = previousAttempts[0];
    if (lastAttempt && (!courseKey.usedAt || new Date(courseKey.usedAt).getTime() <= new Date(lastAttempt.created_at).getTime())) return auth.json(res, 403, { ok: false, error: "This exam access has already been used. A new 500 ETB activation is required for another attempt.", requiresNewPayment: true });
    if (passed && score < 80) return auth.json(res, 400, { ok: false, error: "A passing result requires at least 80%." });
    if (!passed && score >= 80) return auth.json(res, 400, { ok: false, error: "Result status does not match the score." });
    const name = auth.validateName(session.name) || cleanText(body.studentName, 120) || "EDSA Student";
    const studentRows = await db.upsert("students", { email, full_name: name, updated_at: new Date().toISOString() }, "email");
    const student = studentRows[0];
    if (!student) throw new Error("Student record could not be created.");
    const rows = await db.supabaseRequest("/exam_attempts", {
      method: "POST",
      body: JSON.stringify({ student_id: student.id, course_id: courseId, course_title: courseTitle, score, passed, started_at: startedAt, completed_at: completedAt })
    });
    return auth.json(res, 200, { ok: true, attempt: Array.isArray(rows) ? rows[0] || null : rows, student: { name, email } });
  } catch (err) {
    console.error("[EDSA exam attempt]", err);
    return auth.json(res, err.status || 500, { ok: false, error: "Exam attempt could not be saved." });
  }
}

async function adminDashboard(req, res) {
  if (!method(req, res, ["GET"])) return;
  const session = requireRole(req, "admin");
  if (!session) return auth.json(res, 401, { ok: false, authenticated: false, error: "Admin sign-in required." });
  if (!db.dbConfigured()) return auth.json(res, 503, { ok: false, error: "Supabase database is not configured." });
  try {
    const [students, progress, attempts, payments, certificates, activity] = await Promise.all([
      db.select("students", "select=*&order=created_at.desc&limit=500"),
      db.select("course_progress", "select=*&order=updated_at.desc&limit=1000"),
      db.select("exam_attempts", "select=*&order=created_at.desc&limit=1000"),
      db.select("payments", "select=*&order=created_at.desc&limit=1000"),
      db.select("certificates", "select=*&order=issue_date.desc&limit=1000"),
      db.select("student_activity", "select=*&order=created_at.desc&limit=500")
    ]);
    const passedAttempts = attempts.filter(a => a.passed === true).length;
    const revenue = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const courseMap = {};
    attempts.forEach(a => {
      const id = String(a.course_id || "unknown");
      if (!courseMap[id]) courseMap[id] = { course_id: id, course_title: a.course_title || id, attempts: 0, passed: 0, average_score: 0, _sum: 0 };
      courseMap[id].attempts++; if (a.passed) courseMap[id].passed++; courseMap[id]._sum += Number(a.score || 0);
    });
    Object.values(courseMap).forEach(c => { c.average_score = c.attempts ? Math.round((c._sum / c.attempts) * 10) / 10 : 0; delete c._sum; });
    return auth.json(res, 200, {
      ok: true, generated_at: new Date().toISOString(),
      stats: { students: students.length, attempts: attempts.length, passed_attempts: passedAttempts, certificates: certificates.length, payments: payments.length, revenue_etb: revenue },
      students, progress, attempts, payments, certificates, activity, course_stats: Object.values(courseMap)
    });
  } catch (err) {
    console.error("[EDSA admin dashboard]", err);
    return auth.json(res, err.status || 500, { ok: false, error: "Admin dashboard data could not be loaded." });
  }
}

async function certificateRegister(req, res) {
  if (!method(req, res, ["POST"])) return;
  const session = requireRole(req, "student");
  if (!session) return auth.json(res, 401, { ok: false, error: "Student sign-in required." });
  try {
    const token = process.env.EDSA_GITHUB_TOKEN;
    if (!token) return auth.json(res, 500, { ok: false, error: "EDSA_GITHUB_TOKEN is not configured on the server." });
    const body = req.body || {};
    const id = String(body.id || "").trim(), name = String(body.name || "").trim(), course = String(body.course || "").trim();
    const issueDate = String(body.issueDate || "").trim(), score = String(body.score ?? "").trim(), email = String(body.email || "").trim().toLowerCase();
    if (!/^EDSA-\d{4}-\d{6}$/.test(id) || !name || !course || !issueDate) return auth.json(res, 400, { ok: false, error: "Invalid certificate data." });
    if (email && email !== String(session.email || "").trim().toLowerCase()) return auth.json(res, 403, { ok: false, error: "Certificate email does not match the signed-in student." });
    const numericScore = Number(score);
    if (!Number.isFinite(numericScore) || numericScore < 80 || numericScore > 100) return auth.json(res, 400, { ok: false, error: "Only certificates with a passing score of 80% or higher can be registered." });
    const [owner, repo] = REPO_CERT.split("/");
    if (!owner || !repo) return auth.json(res, 500, { ok: false, error: "Invalid EDSA_GITHUB_REPOSITORY." });
    const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", "User-Agent": "EDSA-Certificate-Registry" };
    const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/certificates.json`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const currentResponse = await fetch(fileUrl, { method: "GET", headers, cache: "no-store" });
      if (!currentResponse.ok) return auth.json(res, 502, { ok: false, error: "Could not read the public certificate registry." });
      const current = await currentResponse.json();
      let registry = {};
      try { registry = JSON.parse(Buffer.from(current.content || "", "base64").toString("utf8") || "{}"); } catch (_) { registry = {}; }
      if (registry[id]) return auth.json(res, 200, { ok: true, published: true, id, existing: true });
      registry[id] = { id, name, email, course, issueDate, score, status: "Valid", issuedBy: "Ethiopian Digital Skills Academy" };
      const updateResponse = await fetch(fileUrl, {
        method: "PUT", headers,
        body: JSON.stringify({ message: "Auto-register certificate " + id, content: Buffer.from(JSON.stringify(registry, null, 2) + "\n", "utf8").toString("base64"), sha: current.sha, branch: "main" })
      });
      if (updateResponse.ok) return auth.json(res, 200, { ok: true, published: true, id });
      if (updateResponse.status === 409) continue;
      return auth.json(res, 502, { ok: false, error: "Could not publish the certificate to the public registry." });
    }
    return auth.json(res, 409, { ok: false, error: "The registry changed repeatedly. Please try the certificate again." });
  } catch (error) {
    return auth.json(res, 500, { ok: false, error: "Certificate registration failed." });
  }
}

async function certificateVerify(req, res) {
  if (!method(req, res, ["GET"])) return;
  const id = String((req.query && req.query.id) || "").trim();
  if (!/^EDSA-\d{4}-\d{6}$/.test(id)) return auth.json(res, 400, { ok: false, found: false, error: "Invalid certificate ID." });
  try {
    const token = process.env.EDSA_GITHUB_TOKEN;
    if (!token) return auth.json(res, 500, { ok: false, found: false, error: "Verification service is not configured." });
    const [owner, repo] = REPO_CERT.split("/");
    if (!owner || !repo) return auth.json(res, 500, { ok: false, found: false, error: "Invalid repository configuration." });
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/certificates.json?ref=main`, {
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "EDSA-Certificate-Verification" }, cache: "no-store"
    });
    if (!response.ok) return auth.json(res, 502, { ok: false, found: false, error: "Could not read the certificate registry." });
    const file = await response.json();
    const registry = JSON.parse(Buffer.from(file.content || "", "base64").toString("utf8") || "{}");
    const record = registry[id];
    res.setHeader("Cache-Control", "no-store, max-age=0");
    if (!record) return auth.json(res, 404, { ok: true, found: false, id });
    return auth.json(res, 200, { ok: true, found: true, certificate: record });
  } catch (error) {
    return auth.json(res, 500, { ok: false, found: false, error: "Verification service failed." });
  }
}

const routes = {
  "auth-login": authLogin, "auth-register": authRegister, "auth-me": authMe, "auth-logout": authLogout,
  "admin-login": adminLogin, "admin-me": adminMe, "activate-key": activateKey, "admin-generate-key": adminGenerateKey,
  "course-access": courseAccess, "student-sync": studentSync, "exam-attempt": examAttempt,
  "admin-dashboard": adminDashboard, "register-certificate": certificateRegister, "verify-certificate": certificateVerify
};

module.exports = async function handler(req, res) {
  const action = String((req.query && req.query.action) || "").trim().toLowerCase();
  const fn = routes[action];
  if (!fn) return auth.json(res, 404, { ok: false, error: "Unknown EDSA API action." });
  return fn(req, res);
};
