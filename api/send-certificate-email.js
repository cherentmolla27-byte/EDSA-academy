const { readSession } = require("./_auth");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const session = readSession(req);
    if (!session || session.role !== "student" || !session.email) {
      return res.status(401).json({ ok: false, error: "Student sign-in required." });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EDSA_FROM_EMAIL;
    const appUrl = process.env.EDSA_PUBLIC_URL || "https://edsa-academy.vercel.app";

    if (!apiKey || !from) {
      return res.status(503).json({
        ok: false,
        configured: false,
        error: "Email service is not configured. Add RESEND_API_KEY and EDSA_FROM_EMAIL in Vercel."
      });
    }

    const body = req.body || {};
    const id = String(body.id || "").trim();
    const name = String(body.name || "").trim();
    const course = String(body.course || "").trim();
    const issueDate = String(body.issueDate || "").trim();
    const score = String(body.score ?? "").trim();
    const email = String(body.email || "").trim().toLowerCase();

    if (!/^EDSA-\d{4}-\d{6}$/.test(id) || !name || !course || !issueDate || !email) {
      return res.status(400).json({ ok: false, error: "Invalid certificate email data." });
    }

    if (email !== String(session.email).trim().toLowerCase()) {
      return res.status(403).json({ ok: false, error: "Certificate email does not match the signed-in student." });
    }

    const verifyUrl = appUrl.replace(/\/$/, "") + "/verify?id=" + encodeURIComponent(id);

    const html = `<!doctype html>
<html>
<body style="margin:0;background:#07111f;color:#e5eefb;font-family:Arial,sans-serif;padding:32px">
  <div style="max-width:620px;margin:auto;background:#0d1b2f;border:1px solid #1e3a5f;border-radius:18px;padding:32px">
    <div style="font-size:13px;color:#38bdf8;font-weight:700;letter-spacing:2px">EDSA ACADEMY</div>
    <h1 style="margin:10px 0 8px;color:#fff">Congratulations, ${escapeHtml(name)}! 🎓</h1>
    <p style="line-height:1.6;color:#b9c7d9">You successfully passed the <strong>${escapeHtml(course)}</strong> examination and your EDSA certificate has been registered.</p>
    <div style="background:#07111f;border-radius:12px;padding:18px;margin:22px 0">
      <p style="margin:6px 0"><strong>Certificate ID:</strong> ${escapeHtml(id)}</p>
      <p style="margin:6px 0"><strong>Course:</strong> ${escapeHtml(course)}</p>
      <p style="margin:6px 0"><strong>Score:</strong> ${escapeHtml(score)}%</p>
      <p style="margin:6px 0"><strong>Issue date:</strong> ${escapeHtml(issueDate)}</p>
    </div>
    <a href="${verifyUrl}" style="display:inline-block;background:#38bdf8;color:#03111f;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">Verify Certificate Online</a>
    <p style="margin-top:24px;color:#8092aa;font-size:13px;line-height:1.6">Your email address is used by EDSA for this notification. It is not printed on your certificate.</p>
  </div>
</body>
</html>`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "EDSA Certificate — Congratulations!",
        html
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        error: "Email provider rejected the message.",
        detail: String(result.message || result.name || "").slice(0, 300)
      });
    }

    return res.status(200).json({ ok: true, sent: true, id });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Certificate email failed.",
      detail: String(error && error.message || error).slice(0, 300)
    });
  }
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
