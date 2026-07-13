const crypto = require("crypto");

const SESSION_COOKIE = "bot_sop_session";
const STATE_COOKIE = "bot_sop_oauth_state";

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  return leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createSignedValue(value, secret) {
  const encoded = encode(value);
  return `${encoded}.${sign(encoded, secret)}`;
}

function readSignedValue(value, secret) {
  if (!value || !secret) return null;

  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;

  const encoded = value.slice(0, separator);
  const signature = value.slice(separator + 1);

  if (!safeEqual(signature, sign(encoded, secret))) return null;

  try {
    return Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const header = req.headers.cookie || "";

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;

    const key = part.slice(0, separator).trim();
    if (key !== name) continue;

    return decodeURIComponent(part.slice(separator + 1).trim());
  }

  return null;
}

function serializeCookie(name, value, maxAge) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ];

  if (Number.isFinite(maxAge)) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  }

  return parts.join("; ");
}

function createSession(user, secret, maxAgeSeconds = 28800) {
  const payload = JSON.stringify({
    openId: user.open_id || user.openId || null,
    unionId: user.union_id || user.unionId || null,
    tenantKey: user.tenant_key || user.tenantKey || null,
    name: user.name || "Feishu user",
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds
  });

  return createSignedValue(payload, secret);
}

function readSession(req, secret) {
  const signedValue = readCookie(req, SESSION_COOKIE);
  const payload = readSignedValue(signedValue, secret);

  if (!payload) return null;

  try {
    const session = JSON.parse(payload);
    if (!session.exp || session.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!session.openId && !session.unionId) return null;
    return session;
  } catch {
    return null;
  }
}

module.exports = {
  SESSION_COOKIE,
  STATE_COOKIE,
  createSession,
  createSignedValue,
  readCookie,
  readSession,
  readSignedValue,
  safeEqual,
  serializeCookie
};
