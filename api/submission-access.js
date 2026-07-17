const { getSubmissionAccess } = require("../lib/submission-access");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const access = await getSubmissionAccess(req);
    return res.status(200).json({
      configured: access.configured,
      canSubmitResources: access.canSubmitResources,
      canSubmitUpdates: access.canSubmitUpdates,
      canSubmitSopUpdates: access.canSubmitUpdates
    });
  } catch (error) {
    console.error("Submission access check failed", error);
    return res.status(error.status || 500).json({
      error: error.status === 401
        ? "Please sign in with Feishu to use the Submission Center."
        : "Unable to check Submission Center access."
    });
  }
};
