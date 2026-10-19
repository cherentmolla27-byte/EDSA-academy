const crypto = require("crypto");
const db = require("./_db");

const LEGACY_USERS_URL = "https://raw.githubusercontent.com/cherentmolla27-byte/EDSA-academy/main/auth-users.json";

// Keep the private database-backed account registry warm in reused function instances.
let usersCache = null;
let usersCacheAt = 0;
const USERS_CACHE_MS = 30 * 1000;

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
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

function rowsToUsers(rows) {
  const users = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const email = normalizeEmail(row.email);
    if (!email || !row.password_hash) continue;
    users[email] = {
      name: String(row.name || ""),
      email,
      passwordHash: String(row.password_hash),
      createdAt: row.created_at || new Date().toISOString()
    };
  }
  return users;
}

function usersToRows(users) {
  return Object.values(users || {}).filter(user => user && normalizeEmail(user.email) && user.passwordHash).map(user => ({
    email: normalizeEmail(user.email),
    name: validateName(user.name) || "EDSA Student",
    password_hash: String(user.passwordHash),
    created_at: user.createdAt || new Date().toISOString()
  }));
}

async function importLegacyUsersIfEmpty() {
  const existing = await db.select("student_auth_credentials", "select=email&limit=1");
  if (Array.isArray(existing) && existing.length) return;
  // One-time, server-side import preserves existing scrypt hashes and passwords.
  const response = await fetch(LEGACY_USERS_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const err = new Error("Legacy student account registry could not be loaded");
    err.status = response.status;
    throw err;
  }
  const legacy = await response.json();
  const rows = usersToRows(legacy);
  if (rows.length) await db.upsert("student_auth_credentials", rows, "email");
}

async function readUsers() {
  const now = Date.now();
  if (usersCache && now - usersCacheAt < USERS_CACHE_MS) {
    return { users: usersCache, sha: null };
  }
  let rows = await db.select("student_auth_credentials", "select=email,name,password_hash,created_at&limit=1000");
  if (!Array.isArray(rows) || !rows.length) {
    await importLegacyUsersIfEmpty();
    rows = await db.select("student_auth_credentials", "select=email,name,password_hash,created_at&limit=1000");
  }
  usersCache = rowsToUsers(rows);
  usersCacheAt = Date.now();
  return { users: usersCache, sha: null };
}

async function writeUsers(users) {
  const rows = usersToRows(users);
  if (rows.length) await db.upsert("student_auth_credentials", rows, "email");
  usersCache = { ...users };
  usersCacheAt = Date.now();
  return { ok: true };
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
