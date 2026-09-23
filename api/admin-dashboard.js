const auth = require("./_auth");
const db = require("./_db");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return auth.json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const session = auth.readSession(req);
  if (!session || session.role !== "admin") {
    return auth.json(res, 401, { ok: false, authenticated: false, error: "Admin sign-in required." });
  }

  if (!db.dbConfigured()) {
    return auth.json(res, 503, { ok: false, error: "Supabase database is not configured." });
  }

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
      courseMap[id].attempts++;
      if (a.passed) courseMap[id].passed++;
      courseMap[id]._sum += Number(a.score || 0);
    });
    Object.values(courseMap).forEach(c => {
      c.average_score = c.attempts ? Math.round((c._sum / c.attempts) * 10) / 10 : 0;
      delete c._sum;
    });

    return auth.json(res, 200, {
      ok: true,
      generated_at: new Date().toISOString(),
      stats: {
        students: students.length,
        attempts: attempts.length,
        passed_attempts: passedAttempts,
        certificates: certificates.length,
        payments: payments.length,
        revenue_etb: revenue
      },
      students,
      progress,
      attempts,
      payments,
      certificates,
      activity,
      course_stats: Object.values(courseMap)
    });
  } catch (err) {
    console.error("[EDSA admin dashboard]", err);
    return auth.json(res, err.status || 500, { ok: false, error: "Admin dashboard data could not be loaded." });
  }
};
