const auth = require("./_auth");
const db = require("./_db");

const ALLOWED = new Set(["smm", "dme", "pbm", "gdm", "fme", "dbi"]);

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return auth.json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const session = auth.readSession(req, "student");
  if (!session || session.role !== "student") {
    return auth.json(res, 401, { ok: false, error: "Student sign-in required." });
  }

  const courseId = String((req.query && req.query.courseId) || "").trim().toLowerCase();
  if (!ALLOWED.has(courseId)) {
    return auth.json(res, 400, { ok: false, error: "Course is required." });
  }

  try {
    if (!db.dbConfigured()) {
      return auth.json(res, 503, { ok: false, error: "Learning content service is temporarily unavailable." });
    }

    const rows = await db.select(
      "protected_course_lessons",
      "select=course_id,lessons,updated_at&course_id=eq." + encodeURIComponent(courseId) + "&limit=1"
    );

    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || !Array.isArray(row.lessons)) {
      return auth.json(res, 404, { ok: false, error: "Course lessons are not available yet." });
    }

    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return auth.json(res, 200, {
      ok: true,
      free: true,
      courseId,
      lessons: row.lessons,
      updatedAt: row.updated_at || null
    });
  } catch (error) {
    console.error("[EDSA free course lessons]", error);
    return auth.json(res, 500, { ok: false, error: "Course lessons could not be loaded." });
  }
};
