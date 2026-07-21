const {
  SESSION_COOKIE,
  serializeCookie
} = require("../session");

module.exports = async function logout(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE, "", 0));
  res.setHeader("Cache-Control", "no-store");
  return res.redirect(302, "/signed-out.html");
};

