const {
  COOKIE_NAMES,
  appUrl,
  clearCookie,
  cookie,
  parseCookies,
  sign,
  verify
} = require("../../_discord-auth");

const DISCORD_API = "https://discord.com/api/v10";

const redirectHome = (res, reason) => res.redirect(302, `/?auth=${encodeURIComponent(reason)}`);

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).end();

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

    if (!tokenResponse.ok) return redirectHome(res, "oauth-failed");
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
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const session = sign({
      id: user.id,
      username: user.username,
      displayName: member.nick || user.global_name || user.username,
      avatar: user.avatar,
      exp: expiresAt
    });

    res.setHeader("Set-Cookie", cookie(COOKIE_NAMES.session, session, 7 * 24 * 60 * 60));
    return res.redirect(302, "/?auth=success");
  } catch {
    return redirectHome(res, "server-error");
  }
};
