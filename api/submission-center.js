const handlers = Object.freeze({
  access: require("../lib/api-handlers/submission-access"),
  upload: require("../lib/api-handlers/submission-upload"),
  submit: require("../lib/api-handlers/submissions"),
  reviews: require("../lib/api-handlers/review-requests"),
  apply: require("../lib/api-handlers/apply-approved-update")
});

function queryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

module.exports = async function submissionCenter(req, res) {
  const action = String(queryValue(req.query?.action) || "").trim();
  const handler = handlers[action];

  if (!handler) {
    return res.status(404).json({ error: "Unknown submission center action" });
  }

  return handler(req, res);
};
