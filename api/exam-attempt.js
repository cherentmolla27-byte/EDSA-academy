const crypto = require("crypto");
const auth = require("./_auth");
const db = require("./_db");

function cleanText(value, max = 200) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function asInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function makeGuestEmail() {
  return "guest+" + crypto.randomBytes(12).toString("hex") + "@edsa.local";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return auth.json(res, 405, { ok: false, error: "Method not allowed" });
  }

  let session = auth.readSession(req);
  if (session && session.role === "admin") {
    return auth.json(res, 401, { ok: false, error: "Student sign-in required." });
  }
  if (!db.dbConfigured()) {
    return auth.json(res, 503, { ok: false, error: "Student database is not configured yet." });
  }

  try {
    const body = req.body || {};
    const requestedName = auth.validateName(body.studentName) || cleanText(body.studentName, 120);
    const courseTitle = cleanText(body.courseTitle, 200) || "EDSA Course";
    const courseId = cleanText(body.courseId, 100) || ({
      "Social Media Management": "smm",
      "Digital Marketing Essentials": "dme",
      "Project & Business Management": "pbm",
      "Graphic Design for Marketers": "gdm",
      "Financial Management": "fme",
      "Data Analysis & BI": "dbi"
    }[courseTitle] || courseTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100));
    const score = asInt(body.score);
    const passed = body.passed === true || (score != null && score >= 80);
    const startedAt = body.startedAt ? new Date(body.startedAt).toISOString() : new Date().toISOString();
    const completedAt = body.completedAt ? new Date(body.completedAt).toISOString() : new Date().toISOString();

    if (!courseId || score == null || score < 0 || score > 100) {
      return auth.json(res, 400, { ok: false, error: "Valid course and score are required." });
    }

    // EDSA intentionally allows guest exams. If the student is not signed in,
    // create a signed guest session so every submitted attempt still has a
    // stable student record and can appear in Admin > Exam Management.
    if (!session) {
      session = {
        email: makeGuestEmail(),
        name: requestedName || "EDSA Guest Student",
        role: "guest"
      };
      const token = auth.createSession(session);
      auth.setSessionCookie(res, token);
    }

    const email = auth.normalizeEmail(session.email);
    const name = auth.validateName(session.name) || requestedName || "EDSA Student";

    const studentRows = await db.upsert("students", {
      email,
      full_name: name,
      updated_at: new Date().toISOString()
    }, "email");
    const student = studentRows[0];
    if (!student) throw new Error("Student record could not be created.");

    const rows = await db.supabaseRequest("/exam_attempts", {
      method: "POST",
      body: JSON.stringify({
        student_id: student.id,
        course_id: courseId,
        course_title: courseTitle,
        score,
        passed,
        started_at: startedAt,
        completed_at: completedAt
      })
    });

    return auth.json(res, 200, {
      ok: true,
      attempt: Array.isArray(rows) ? rows[0] || null : rows,
      guest: session.role === "guest"
    });
  } catch (err) {
    console.error("[EDSA exam attempt]", err);
    return auth.json(res, err.status || 500, { ok: false, error: "Exam attempt could not be saved." });
  }
};
