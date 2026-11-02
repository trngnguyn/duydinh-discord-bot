const fs = require("node:fs");
const crypto = require("node:crypto");

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

class GoogleSheetPublisher {
  /** Writes attendance tables with a Google service account. No client is created when sheet sync is off. */
  constructor({ spreadsheetId = "", keyFile = "", fetchImpl = globalThis.fetch } = {}) {
    this.spreadsheetId = String(spreadsheetId || "").trim();
    this.keyFile = String(keyFile || "").trim();
    this.fetchImpl = fetchImpl;
    this.accessToken = "";
    this.accessTokenExpiresAt = 0;
  }

  get enabled() {
    return Boolean(this.spreadsheetId && this.keyFile);
  }

  /** Replaces the Chi tiết and Thống kê tabs with the latest tables. */
  async publish({ detail, summary }) {
    if (!this.enabled) return false;
    const token = await this.token();
    const titles = await this.sheetTitles(token);
    const missing = ["Chi tiết", "Thống kê"].filter(title => !titles.includes(title));
    if (missing.length) await this.addSheets(token, missing);
    await this.writeTables(token, [
      ["Chi tiết", detail],
      ["Thống kê", summary]
    ]);
    return true;
  }

  async token() {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) return this.accessToken;
    const key = JSON.parse(fs.readFileSync(this.keyFile, "utf8"));
    const response = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: signServiceAccountJwt(key)
      })
    });
    const body = await readJson(response);
    if (!response.ok || !body.access_token) {
      throw new Error(googleError(body, response.status));
    }
    this.accessToken = body.access_token;
    this.accessTokenExpiresAt = Date.now() + (Number(body.expires_in) || 3600) * 1000 - 60000;
    return this.accessToken;
  }

  async sheetTitles(token) {
    const response = await this.request(token, `/${this.spreadsheetId}?fields=sheets.properties.title`, { method: "GET" });
    const body = await readJson(response);
    if (!response.ok) throw new Error(googleError(body, response.status));
    return (body.sheets || []).map(sheet => sheet.properties?.title).filter(Boolean);
  }

  async addSheets(token, titles) {
    const response = await this.request(token, `/${this.spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: titles.map(title => ({ addSheet: { properties: { title } } }))
      })
    });
    const body = await readJson(response);
    if (!response.ok) throw new Error(googleError(body, response.status));
  }

  async writeTables(token, tables) {
    const clear = await this.request(token, `/${this.spreadsheetId}/values:batchClear`, {
      method: "POST",
      body: JSON.stringify({ ranges: tables.map(([title]) => `'${title}'!A:ZZ`) })
    });
    const cleared = await readJson(clear);
    if (!clear.ok) throw new Error(googleError(cleared, clear.status));

    const update = await this.request(token, `/${this.spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: tables.map(([title, values]) => ({ range: `'${title}'!A1`, values }))
      })
    });
    const written = await readJson(update);
    if (!update.ok) throw new Error(googleError(written, update.status));
  }

  request(token, path, init) {
    return this.fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      }
    });
  }
}

function signServiceAccountJwt(key) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: key.client_email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));
  const payload = `${header}.${claims}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(payload), key.private_key).toString("base64url");
  return `${payload}.${signature}`;
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text.slice(0, 300) } };
  }
}

function googleError(body, status) {
  const message = body?.error?.message || body?.error_description || `Google trả về ${status}.`;
  if (body?.error?.status === "PERMISSION_DENIED" || status === 403) {
    return `${message} Hãy chia sẻ sheet cho email service account với quyền Người chỉnh sửa và bật Google Sheets API.`;
  }
  return message;
}

module.exports = { GoogleSheetPublisher, signServiceAccountJwt };
