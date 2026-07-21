const handlers = Object.freeze({
  favorites: require("../lib/api-handlers/favorites"),
  "send-to-me": require("../lib/api-handlers/send-to-me")
});

function queryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

module.exports = async function userActions(req, res) {
  const action = String(queryValue(req.query?.action) || "").trim();
  const handler = handlers[action];

  if (!handler) {
    return res.status(404).json({ error: "Unknown user action" });
  }

  return handler(req, res);
};
