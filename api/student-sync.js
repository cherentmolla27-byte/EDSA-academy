const auth = require("./_auth");
const db = require("./_db");

function cleanText(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function asInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return auth.json(res, 405, { ok: false, error: "Method not allowed" });

  const session = auth.readSession(req);
  if (!session || session.role === "admin") return auth.json(res, 401, { ok: false, error: "Student sign-in required." });
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

    const studentRows = await db.upsert("students", {
      email,
      full_name: name || cleanText(profile.name, 120) || "EDSA Student",
      updated_at: new Date().toISOString()
    }, "email");
    const student = studentRows[0];
    if (!student) throw new Error("Student record could not be created.");

    const courseRows = [];
    const studentJourney = journey[email] || journey[session.email] || journey[Object.keys(journey)[0]];
    if (studentJourney && studentJourney.courses && typeof studentJourney.courses === "object") {
      Object.entries(studentJourney.courses).forEach(([courseId, item]) => {
        if (!item || typeof item !== "object") return;
        courseRows.push({
          student_id: student.id,
          course_id: cleanText(courseId, 100),
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
      certificate_id: cleanText(r.id, 120),
      student_id: student.id,
      student_name: cleanText(r.name || name, 120) || name || "EDSA Student",
      course_id: cleanText(r.courseId || r.course_id || r.course, 100) || "unknown",
      course_title: cleanText(r.courseTitle || r.course || "EDSA Course", 200),
      score: asInt(r.score),
      issue_date: String(r.issueDate || new Date().toISOString()).slice(0, 10),
      status: cleanText(r.status || "Valid", 40),
      verification_url: cleanText(r.verificationUrl || r.verification_url, 500) || null,
      issued_by: cleanText(r.issuedBy || "Ethiopian Digital Skills Academy", 200)
    }));
    if (certificateRows.length) await db.upsert("certificates", certificateRows, "certificate_id");

    return auth.json(res, 200, {
      ok: true,
      synced: { student: true, progress: courseRows.length, certificates: certificateRows.length }
    });
  } catch (err) {
    console.error("[EDSA student sync]", err);
    return auth.json(res, err.status || 500, { ok: false, error: "Student database sync failed." });
  }
};
