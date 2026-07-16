const crypto = require("crypto");

const COOKIE_NAMES = {
  state: "mecha_oauth_state",
  session: "mecha_session"
};

const parseCookies = (header = "") => Object.fromEntries(
  header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf("=");
    if (separator === -1) return [part, ""];
    return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
  })
);

const base64url = (value) => Buffer.from(value).toString("base64url");

const signingSecret = () => {
  const secret = process.env.SESSION_SECRET || process.env.DISCORD_CLIENT_SECRET;
  if (!secret) throw new Error("Missing SESSION_SECRET or DISCORD_CLIENT_SECRET");
  return secret;
};

const signatureFor = (payload) => crypto
  .createHmac("sha256", signingSecret())
  .update(payload)
  .digest("base64url");

const sign = (value) => {
  const payload = base64url(JSON.stringify(value));
  return `${payload}.${signatureFor(payload)}`;
};

const verify = (token) => {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const expected = signatureFor(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (value.exp && Date.now() > value.exp) return null;
    return value;
  } catch {
    return null;
  }
};

const cookie = (name, value, maxAge) => [
  `${name}=${encodeURIComponent(value)}`,
  "Path=/",
  "HttpOnly",
  "Secure",
  "SameSite=Lax",
  `Max-Age=${maxAge}`
].join("; ");

const clearCookie = (name) => `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

const appUrl = (req) => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const protocol = req.headers["x-forwarded-proto"] || "https";
  return `${protocol}://${host}`;
};

module.exports = {
  COOKIE_NAMES,
  appUrl,
  clearCookie,
  cookie,
  parseCookies,
  sign,
  verify
};
