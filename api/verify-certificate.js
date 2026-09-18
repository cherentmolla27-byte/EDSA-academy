export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const id = String((req.query && req.query.id) || "").trim();
  if (!/^EDSA-\d{4}-\d{6}$/.test(id)) {
    return res.status(400).json({ ok: false, found: false, error: "Invalid certificate ID." });
  }

  try {
    const token = process.env.EDSA_GITHUB_TOKEN;
    const repository = process.env.EDSA_GITHUB_REPOSITORY || "cherentmolla27-byte/EDSA-academy";
    if (!token) {
      return res.status(500).json({ ok: false, found: false, error: "Verification service is not configured." });
    }

    const [owner, repo] = repository.split("/");
    if (!owner || !repo) {
      return res.status(500).json({ ok: false, found: false, error: "Invalid repository configuration." });
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/certificates.json?ref=main`,
      {
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "EDSA-Certificate-Verification"
        },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return res.status(502).json({ ok: false, found: false, error: "Could not read the certificate registry." });
    }

    const file = await response.json();
    const registry = JSON.parse(
      Buffer.from(file.content || "", "base64").toString("utf8") || "{}"
    );
    const record = registry[id];

    res.setHeader("Cache-Control", "no-store, max-age=0");
    if (!record) {
      return res.status(404).json({ ok: true, found: false, id });
    }

    return res.status(200).json({ ok: true, found: true, certificate: record });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      found: false,
      error: "Verification service failed."
    });
  }
}
