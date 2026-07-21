const { readSession } = require("../session");
const {
  getTenantToken,
  fetchTableRecords,
  createTableRecord,
  deleteTableRecord
} = require("../feishu");

const FIELD_NAMES = {
  userId: "User Open ID",
  recordId: "Record ID",
  recordType: "Record Type",
  title: "Content Name",
  dateAdded: "Date Added"
};

function fieldText(value) {
  if (value === null || value === undefined) return "";

  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    return value.map(fieldText).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    return fieldText(
      value.text ??
      value.name ??
      value.value ??
      value.label ??
      value.title ??
      ""
    );
  }

  return "";
}

function favoriteFromRecord(record) {
  const fields = record?.fields || {};

  return {
    favoriteRecordId: record.record_id || record.recordId || "",
    userId: fieldText(fields[FIELD_NAMES.userId]),
    recordId: fieldText(fields[FIELD_NAMES.recordId]),
    recordType: fieldText(fields[FIELD_NAMES.recordType]),
    title: fieldText(fields[FIELD_NAMES.title])
  };
}

function parseBody(req) {
  if (!req.body) return {};

  if (typeof req.body === "object") {
    return req.body;
  }

  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function cleanText(value, maximumLength = 500) {
  return String(value || "").trim().slice(0, maximumLength);
}

module.exports = async function favorites(req, res) {
  if (!["GET", "POST", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "private, no-store");

  const sessionSecret = process.env.SESSION_SECRET;
  const session = sessionSecret
    ? readSession(req, sessionSecret)
    : null;

  if (!session) {
    return res.status(401).json({
      error: "Feishu sign-in required"
    });
  }

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const appToken =
    process.env.FEISHU_FAVORITES_APP_TOKEN ||
    process.env.FEISHU_BASE_APP_TOKEN;
  const tableId = process.env.FEISHU_FAVORITES_TABLE_ID;
  const viewId = process.env.FEISHU_FAVORITES_VIEW_ID || "";
  const apiOrigin =
    process.env.FEISHU_API_ORIGIN ||
    "https://open.feishu.cn";

  if (!appId || !appSecret || !appToken || !tableId) {
    return res.status(500).json({
      error: "Favorites are not configured"
    });
  }

  const currentUserId = session.openId || session.unionId;

  try {
    const tenantToken = await getTenantToken({
      apiOrigin,
      appId,
      appSecret
    });

    const records = await fetchTableRecords({
      apiOrigin,
      tenantToken,
      appToken,
      tableId,
      viewId
    });

    const userFavorites = records
      .map(favoriteFromRecord)
      .filter(favorite => favorite.userId === currentUserId);

    if (req.method === "GET") {
      return res.status(200).json({
        favorites: userFavorites.map(favorite => ({
          recordId: favorite.recordId,
          recordType: favorite.recordType,
          title: favorite.title
        }))
      });
    }

    const body = parseBody(req);
    const recordId = cleanText(body.recordId, 200);
    const recordType = cleanText(body.recordType, 50);
    const title = cleanText(body.title, 500);

    if (!recordId || !["SOP", "Resource"].includes(recordType)) {
      return res.status(400).json({
        error: "A valid record ID and record type are required"
      });
    }

    const matchingFavorites = userFavorites.filter(favorite =>
      favorite.recordId === recordId &&
      favorite.recordType === recordType
    );

    if (req.method === "DELETE") {
      await Promise.all(
        matchingFavorites
          .filter(favorite => favorite.favoriteRecordId)
          .map(favorite =>
            deleteTableRecord({
              apiOrigin,
              tenantToken,
              appToken,
              tableId,
              recordId: favorite.favoriteRecordId
            })
          )
      );

      return res.status(200).json({
        removed: true,
        recordId,
        recordType
      });
    }

    if (matchingFavorites.length) {
      return res.status(200).json({
        added: false,
        alreadyExists: true,
        favorite: {
          recordId,
          recordType,
          title: matchingFavorites[0].title || title
        }
      });
    }

    await createTableRecord({
      apiOrigin,
      tenantToken,
      appToken,
      tableId,
      fields: {
        [FIELD_NAMES.userId]: currentUserId,
        [FIELD_NAMES.recordId]: recordId,
        [FIELD_NAMES.recordType]: recordType,
        [FIELD_NAMES.title]: title,
        [FIELD_NAMES.dateAdded]: Date.now()
      }
    });

    return res.status(201).json({
      added: true,
      favorite: {
        recordId,
        recordType,
        title
      }
    });
  } catch (error) {
    console.error("Favorites request failed", {
      method: req.method,
      message: error.message,
      status: error.status,
      feishuCode: error.feishuCode
    });

    return res.status(502).json({
      error: "Unable to update favorites",
      feishuCode: error.feishuCode || null
    });
  }
};

