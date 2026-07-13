const crypto = require("crypto");
const {
  STATE_COOKIE,
  createSignedValue,
  serializeCookie
} = require("../../lib/session");

function getOrigin() {
  return process.env.APP_URL?.replace(/\/$/, "") || null;
}

module.exports = async function login(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const appId = process.env.FEISHU_APP_ID;
  const sessionSecret = process.env.SESSION_SECRET;
  const appOrigin = getOrigin();

  if (!appId || !sessionSecret || !appOrigin) {
    return res.status(500).json({ error: "Authentication is not configured" });
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const redirectUri = `${appOrigin}/api/auth/callback`;
  const accountsOrigin = process.env.FEISHU_ACCOUNTS_ORIGIN ||
    "https://accounts.feishu.cn";

  const authorizeUrl = new URL(
    "/open-apis/authen/v1/authorize",
    accountsOrigin
  );

  authorizeUrl.searchParams.set("client_id", appId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  if (process.env.FEISHU_OAUTH_SCOPE) {
    authorizeUrl.searchParams.set("scope", process.env.FEISHU_OAUTH_SCOPE);
  }

  res.setHeader(
    "Set-Cookie",
    serializeCookie(
      STATE_COOKIE,
      createSignedValue(state, sessionSecret),
      600
    )
  );
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, authorizeUrl.toString());
};
