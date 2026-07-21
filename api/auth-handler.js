const handlers = Object.freeze({
  login: require("../lib/api-handlers/auth-login"),
  callback: require("../lib/api-handlers/auth-callback"),
  logout: require("../lib/api-handlers/auth-logout")
});

function queryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

module.exports = async function authHandler(req, res) {
  const action = String(queryValue(req.query?.action) || "").trim();
  const handler = handlers[action];

  if (!handler) {
    return res.status(404).json({ error: "Unknown authentication action" });
  }

  return handler(req, res);
};
