export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const token = process.env.EDSA_GITHUB_TOKEN;
    const repository = process.env.EDSA_GITHUB_REPOSITORY || "cherentmolla27-byte/EDSA-academy";

    if (!token) {
      return res.status(500).json({
        ok: false,
        error: "EDSA_GITHUB_TOKEN is not configured on the server."
      });
    }

    const body = req.body || {};
    const id = String(body.id || "").trim();
    const name = String(body.name || "").trim();
    const course = String(body.course || "").trim();
    const issueDate = String(body.issueDate || "").trim();
    const score = String(body.score ?? "").trim();

    if (!/^EDSA-\d{4}-\d{6}$/.test(id) || !name || !course || !issueDate) {
      return res.status(400).json({ ok: false, error: "Invalid certificate data." });
    }

    const [owner, repo] = repository.split("/");
    if (!owner || !repo) {
      return res.status(500).json({ ok: false, error: "Invalid EDSA_GITHUB_REPOSITORY." });
    }

    const headers = {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "EDSA-Certificate-Registry"
    };

    const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/certificates.json`;

    // Read the current registry and update it server-side. Retry if another
    // certificate is published at the same time and changes the file SHA.
    for (let attempt = 0; attempt < 3; attempt++) {
      const currentResponse = await fetch(fileUrl, {
        method: "GET",
        headers,
        cache: "no-store"
      });

      if (!currentResponse.ok) {
        const detail = await currentResponse.text();
        return res.status(502).json({
          ok: false,
          error: "Could not read the public certificate registry.",
          detail: detail.slice(0, 500)
        });
      }

      const current = await currentResponse.json();
      const currentContent = Buffer.from(current.content || "", "base64").toString("utf8");

      let registry = {};
      try {
        registry = JSON.parse(currentContent || "{}");
      } catch (_) {
        registry = {};
      }

      if (registry[id]) {
        // Idempotent: the same certificate can be registered more than once
        // without creating a duplicate record.
        return res.status(200).json({ ok: true, published: true, id, existing: true });
      }

      registry[id] = {
        id,
        name,
        course,
        issueDate,
        score,
        status: "Valid",
        issuedBy: "Ethiopian Digital Skills Academy"
      };

      const updatedContent = JSON.stringify(registry, null, 2) + "\n";

      const updateResponse = await fetch(fileUrl, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: "Auto-register certificate " + id,
          content: Buffer.from(updatedContent, "utf8").toString("base64"),
          sha: current.sha,
          branch: "main"
        })
      });

      if (updateResponse.ok) {
        return res.status(200).json({ ok: true, published: true, id });
      }

      if (updateResponse.status === 409) continue;

      const detail = await updateResponse.text();
      return res.status(502).json({
        ok: false,
        error: "Could not publish the certificate to the public registry.",
        detail: detail.slice(0, 500)
      });
    }

    return res.status(409).json({
      ok: false,
      error: "The registry changed repeatedly. Please try the certificate again."
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Certificate registration failed.",
      detail: String(error && error.message || error).slice(0, 500)
    });
  }
}
