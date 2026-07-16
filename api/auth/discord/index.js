const crypto = require("crypto");
const { COOKIE_NAMES, appUrl, cookie, sign } = require("../../_discord-auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).end();

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
