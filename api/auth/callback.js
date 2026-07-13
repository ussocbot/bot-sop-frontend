const {
  SESSION_COOKIE,
  STATE_COOKIE,
  createSession,
  readCookie,
  readSignedValue,
  safeEqual,
  serializeCookie
} = require("../../lib/session");

function getOrigin() {
  return process.env.APP_URL?.replace(/\/$/, "") || null;
}

async function readJson(response) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok || (typeof body.code === "number" && body.code !== 0)) {
    const error = new Error(body.msg || `Feishu request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return body;
}

module.exports = async function callback(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const sessionSecret = process.env.SESSION_SECRET;
  const appOrigin = getOrigin();

  if (!appId || !appSecret || !sessionSecret || !appOrigin) {
    return res.status(500).json({ error: "Authentication is not configured" });
  }

  if (req.query.error) {
    return res.status(403).json({ error: "Feishu authorization was declined" });
  }

  const receivedState = String(req.query.state || "");
  const storedState = readSignedValue(
    readCookie(req, STATE_COOKIE),
    sessionSecret
  );

  if (!storedState || !receivedState || !safeEqual(storedState, receivedState)) {
    return res.status(400).json({ error: "Invalid or expired sign-in request" });
  }

  const code = String(req.query.code || "");
  if (!code) return res.status(400).json({ error: "Missing authorization code" });

  const apiOrigin = process.env.FEISHU_API_ORIGIN || "https://open.feishu.cn";

  try {
    const tokenResponse = await fetch(
      `${apiOrigin}/open-apis/authen/v2/oauth/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: appId,
          client_secret: appSecret,
          code
        })
      }
    );

    const tokenBody = await readJson(tokenResponse);
    const accessToken = tokenBody.access_token || tokenBody.data?.access_token;

    if (!accessToken) throw new Error("Feishu did not return a user access token");

    const userResponse = await fetch(
      `${apiOrigin}/open-apis/authen/v1/user_info`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=utf-8"
        }
      }
    );

    const userBody = await readJson(userResponse);
    const user = userBody.data || userBody;
    const allowedTenant = process.env.FEISHU_ALLOWED_TENANT_KEY;

    if (allowedTenant && user.tenant_key !== allowedTenant) {
      return res.status(403).json({ error: "This Feishu tenant is not authorized" });
    }

    const session = createSession(user, sessionSecret);

    res.setHeader("Set-Cookie", [
      serializeCookie(SESSION_COOKIE, session, 28800),
      serializeCookie(STATE_COOKIE, "", 0)
    ]);
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, `${appOrigin}/`);
  } catch (error) {
    console.error("Feishu callback failed", error.message);
    res.status(502).json({ error: "Unable to complete Feishu sign-in" });
  }
};
