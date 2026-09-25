const crypto = require("crypto");

const REPO = process.env.EDSA_AUTH_REPO || "cherentmolla27-byte/EDSA-academy";
const BRANCH = "main";
const USERS_PATH = "auth-users.json";

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function getToken() {
  return process.env.EDSA_GITHUB_TOKEN || "";
}

async function githubRequest(path, options = {}) {
  const token = getToken();
  if (!token) throw new Error("EDSA_GITHUB_TOKEN is not configured");
  const response = await fetch("https://api.github.com" + path, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.message || "GitHub request failed");
    err.status = response.status;
    throw err;
  }
  return data;
}

async function readUsers() {
  try {
    const data = await githubRequest("/repos/" + REPO + "/contents/" + USERS_PATH + "?ref=" + BRANCH);
    const raw = Buffer.from(data.content || "", "base64").toString("utf8");
    const users = JSON.parse(raw || "{}");
    return { users: users && typeof users === "object" ? users : {}, sha: data.sha };
  } catch (err) {
    if (err.status === 404) return { users: {}, sha: null };
    throw err;
  }
}

async function writeUsers(users, sha, message) {
  const body = Buffer.from(JSON.stringify(users, null, 2) + "\n", "utf8").toString("base64");
  const payload = { message, content: body, branch: BRANCH };
  if (sha) payload.sha = sha;
  return githubRequest("/repos/" + REPO + "/contents/" + USERS_PATH, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validateName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").slice(0, 120);
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 128;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => err ? reject(err) : resolve(key));
  });
  return "scrypt$" + salt + "$" + Buffer.from(derived).toString("hex");
}

async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = parts[1];
  const expected = Buffer.from(parts[2], "hex");
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, expected.length, { N: 16384, r: 8, p: 1 }, (err, key) => err ? reject(err) : resolve(key));
  });
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

function sessionSecret() {
  return process.env.EDSA_AUTH_SECRET || "";
}

function createSession(payload) {
  const secret = sessionSecret();
  if (!secret) throw new Error("EDSA_AUTH_SECRET is not configured");
  const body = Buffer.from(JSON.stringify({
    ...payload,
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000
  }), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return body + "." + sig;
}

function readSession(req) {
  const secret = sessionSecret();
  if (!secret) return null;

  // A stale/invalid cookie must NOT hide a valid Authorization bearer token.
  // Browsers can keep an old EDSA_SESSION cookie while the app has a newer
  // signed token in sessionStorage. Try both independently and accept the
  // first valid session.
  const cookie = String(req.headers.cookie || "")
    .split(";")
    .map(x => x.trim())
    .find(x => x.startsWith("EDSA_SESSION="));
  const authorization = String(req.headers.authorization || "");
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  const candidates = [];

  if (cookie) {
    try { candidates.push(decodeURIComponent(cookie.slice("EDSA_SESSION=".length))); } catch (_) {}
  }
  if (bearer && bearer[1]) candidates.push(bearer[1].trim());

  for (const token of candidates) {
    const parts = String(token || "").split(".");
    if (parts.length !== 2) continue;
    try {
      const expected = crypto.createHmac("sha256", secret).update(parts[0]).digest("base64url");
      if (expected.length !== parts[1].length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[1]))) continue;
      const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
      if (!payload.exp || payload.exp < Date.now()) continue;
      return payload;
    } catch (_) {
      // Try the next authentication source.
    }
  }
  return null;
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", "EDSA_SESSION=" + encodeURIComponent(token) + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800");
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "EDSA_SESSION=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
}

module.exports = {
  json, readUsers, writeUsers, normalizeEmail, validateName, validatePassword,
  hashPassword, verifyPassword, createSession, readSession, setSessionCookie, clearSessionCookie
};
