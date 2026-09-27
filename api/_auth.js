const crypto = require("crypto");

const REPO = process.env.EDSA_AUTH_REPO || "cherentmolla27-byte/EDSA-academy";
const BRANCH = "main";
const USERS_PATH = "auth-users.json";

// Keep the user registry warm inside a reused Vercel function instance.
// This removes a GitHub API round-trip from most repeat sign-ins while
// keeping registration writes authoritative and invalidating the cache.
let usersCache = null;
let usersCacheAt = 0;
const USERS_CACHE_MS = 60 * 1000;

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
  const now = Date.now();
  if (usersCache && now - usersCacheAt < USERS_CACHE_MS) {
    return { users: usersCache.users, sha: usersCache.sha };
  }
  try {
    const data = await githubRequest("/repos/" + REPO + "/contents/" + USERS_PATH + "?ref=" + BRANCH);
    const raw = Buffer.from(data.content || "", "base64").toString("utf8");
    const users = JSON.parse(raw || "{}");
    const normalized = users && typeof users === "object" ? users : {};
    usersCache = { users: normalized, sha: data.sha };
    usersCacheAt = now;
    return { users: normalized, sha: data.sha };
  } catch (err) {
    if (err.status === 404) {
      usersCache = { users: {}, sha: null };
      usersCacheAt = now;
      return { users: {}, sha: null };
    }
    throw err;
  }
}

async function writeUsers(users, sha, message) {
  const body = Buffer.from(JSON.stringify(users, null, 2) + "\n", "utf8").toString("base64");
  const payload = { message, content: body, branch: BRANCH };
  if (sha) payload.sha = sha;
  const result = await githubRequest("/repos/" + REPO + "/contents/" + USERS_PATH, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  usersCache = { users, sha: result && result.content ? result.content.sha : sha };
  usersCacheAt = Date.now();
  return result;
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

function readSession(req, expectedRole) {
  const secret = sessionSecret();
  if (!secret) return null;
  const headers = req.headers || {};
  const cookiePairs = String(headers.cookie || "")
    .split(";")
    .map(x => x.trim())
    .filter(Boolean);
  const cookieName = expectedRole === "admin" ? "EDSA_ADMIN_SESSION" : "EDSA_STUDENT_SESSION";
  const cookie = cookiePairs.find(x => x.startsWith(cookieName + "="));
  const authorization = String(headers.authorization || "");
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  const candidates = [];
  if (cookie) {
    try { candidates.push(decodeURIComponent(cookie.slice((cookieName + "=").length))); } catch (_) {}
  }
  if (expectedRole !== "admin" && bearer && bearer[1]) candidates.push(bearer[1].trim());
  for (const token of candidates) {
    const parts = String(token || "").split(".");
    if (parts.length !== 2) continue;
    try {
      const expected = crypto.createHmac("sha256", secret).update(parts[0]).digest("base64url");
      if (expected.length !== parts[1].length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[1]))) continue;
      const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
      if (!payload.exp || payload.exp < Date.now()) continue;
      if (expectedRole && payload.role !== expectedRole) continue;
      return payload;
    } catch (_) {}
  }
  return null;
}

function setSessionCookie(res, token, role) {
  const name = role === "admin" ? "EDSA_ADMIN_SESSION" : "EDSA_STUDENT_SESSION";
  res.setHeader("Set-Cookie", [
    name + "=" + encodeURIComponent(token) + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800",
    "EDSA_SESSION=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  ]);
}

function clearSessionCookie(res, role) {
  const name = role === "admin" ? "EDSA_ADMIN_SESSION" : "EDSA_STUDENT_SESSION";
  res.setHeader("Set-Cookie", name + "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
}

function clearLegacySessionCookie(res) {
  res.setHeader("Set-Cookie", "EDSA_SESSION=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
}

module.exports = {
  json, readUsers, writeUsers, normalizeEmail, validateName, validatePassword,
  hashPassword, verifyPassword, createSession, readSession, setSessionCookie,
  clearSessionCookie, clearLegacySessionCookie
};
