const auth = require("./_auth");
const db = require("./_db");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, private");
  return res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });
  const session = auth.readSession(req, "admin");
  if (!session || session.role !== "admin") return json(res, 401, { ok: false, error: "Admin sign-in required." });
  if (!db.dbConfigured()) return json(res, 503, { ok: false, error: "Course database is not configured." });

  const courseId = String((req.query && req.query.courseId) || "").trim().toLowerCase();
  const allowed = ["smm", "dme", "pbm", "gdm", "fme", "dbi"];
  if (!allowed.includes(courseId)) return json(res, 400, { ok: false, error: "Invalid course." });

  try {
    const rows = await db.select("protected_course_lessons", "select=lessons&course_id=eq." + encodeURIComponent(courseId) + "&limit=1");
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || !Array.isArray(row.lessons)) return json(res, 404, { ok: false, error: "Course lessons are unavailable." });
    return json(res, 200, { ok: true, courseId, lessons: row.lessons, adminPreview: true });
  } catch (error) {
    console.error("[EDSA admin course content]", error);
    return json(res, 500, { ok: false, error: "Course lessons could not be loaded." });
  }
};
