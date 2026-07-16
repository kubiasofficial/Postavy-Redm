const crypto = require("crypto");
const {
  COOKIE_NAMES,
  appUrl,
  clearCookie,
  cookie,
  parseCookies,
  sign,
  verify
} = require("../lib/discord-auth");

const DISCORD_API = "https://discord.com/api/v10";

const redirectHome = (res, reason) => res.redirect(302, `/?auth=${encodeURIComponent(reason)}`);

const startLogin = (req, res) => {
  const clientId = process.env.DISCORD_APPLICATION_ID;
  if (!clientId || !process.env.DISCORD_CLIENT_SECRET) {
    return res.status(500).send("Discord login is not configured.");
  }

  const state = crypto.randomBytes(24).toString("hex");
  const stateToken = sign({ state, exp: Date.now() + 10 * 60 * 1000 });
  const redirectUri = `${appUrl(req)}/api/auth/discord/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
    state
  });

  res.setHeader("Set-Cookie", cookie(COOKIE_NAMES.state, stateToken, 600));
  return res.redirect(302, `https://discord.com/oauth2/authorize?${params}`);
};

const finishLogin = async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const savedState = verify(cookies[COOKIE_NAMES.state]);
  res.setHeader("Set-Cookie", clearCookie(COOKIE_NAMES.state));

  if (!req.query.code || !req.query.state || savedState?.state !== req.query.state) {
    return redirectHome(res, "invalid-state");
  }

  const redirectUri = `${appUrl(req)}/api/auth/discord/callback`;

  try {
    const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_APPLICATION_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: req.query.code,
        redirect_uri: redirectUri
      })
    });
    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.json().catch(() => ({}));
      console.error("Discord OAuth token exchange failed", {
        status: tokenResponse.status,
        error: tokenError.error,
        errorDescription: tokenError.error_description
      });
      if (tokenError.error === "invalid_client") return redirectHome(res, "oauth-invalid-client");
      if (tokenError.error === "invalid_grant") return redirectHome(res, "oauth-invalid-grant");
      return redirectHome(res, "oauth-failed");
    }

    const token = await tokenResponse.json();
    const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    if (!userResponse.ok) return redirectHome(res, "profile-failed");
    const user = await userResponse.json();

    const memberResponse = await fetch(
      `${DISCORD_API}/guilds/${process.env.DISCORD_GUILD_ID}/members/${user.id}`,
      { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
    );
    if (memberResponse.status === 404) return redirectHome(res, "not-member");
    if (!memberResponse.ok) return redirectHome(res, "membership-check-failed");

    const member = await memberResponse.json();
    const session = sign({
      id: user.id,
      username: user.username,
      displayName: member.nick || user.global_name || user.username,
      avatar: user.avatar,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    });
    res.setHeader("Set-Cookie", cookie(COOKIE_NAMES.session, session, 7 * 24 * 60 * 60));
    return res.redirect(302, "/?auth=success");
  } catch {
    return redirectHome(res, "server-error");
  }
};

const getSession = (req, res) => {
  const session = verify(parseCookies(req.headers.cookie)[COOKIE_NAMES.session]);
  res.setHeader("Cache-Control", "no-store");
  if (!session) return res.status(401).json({ authenticated: false });
  const avatarUrl = session.avatar
    ? `https://cdn.discordapp.com/avatars/${session.id}/${session.avatar}.png?size=128`
    : null;
  return res.status(200).json({
    authenticated: true,
    user: {
      id: session.id,
      username: session.username,
      displayName: session.displayName,
      avatarUrl
    }
  });
};

module.exports = async (req, res) => {
  const action = req.query.action;
  if (action === "discord" && req.method === "GET") return startLogin(req, res);
  if (action === "callback" && req.method === "GET") return finishLogin(req, res);
  if (action === "session" && req.method === "GET") return getSession(req, res);
  if (action === "logout" && req.method === "POST") {
    res.setHeader("Set-Cookie", clearCookie(COOKIE_NAMES.session));
    return res.status(204).end();
  }
  return res.status(404).json({ error: "Not found" });
};
