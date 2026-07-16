const { COOKIE_NAMES, parseCookies, verify } = require("../_discord-auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).end();
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
