const { getSubmissionAccess } = require("../lib/submission-access");
const applyApprovedUpdate = require("./apply-approved-update");

const RECORD_ID = /^rec[A-Za-z0-9_-]+$/;

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const access = await getSubmissionAccess(req);
    if (!access?.canReviewUpdates) return res.status(403).json({ error: "Review access is required" });

    const recordId = String(bodyOf(req).recordId || "").trim();
    if (!RECORD_ID.test(recordId)) return res.status(400).json({ error: "A valid request record ID is required" });
    if (!process.env.UPDATE_APPLY_SECRET) return res.status(500).json({ error: "Approved-update automation is not configured" });

    const captured = {
      statusCode: 200,
      payload: {},
      setHeader() {},
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; }
    };
    await applyApprovedUpdate({
      method: "POST",
      headers: { "x-update-secret": process.env.UPDATE_APPLY_SECRET },
      query: {},
      body: { recordId }
    }, captured);
    return res.status(captured.statusCode).json(captured.payload);
  } catch (error) {
    console.error("Approved update retry failed", error);
    return res.status(error.status || 500).json({ error: String(error.message || "Unable to retry this update") });
  }
};
