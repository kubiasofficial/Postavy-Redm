const { COOKIE_NAMES, clearCookie } = require("../_discord-auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  res.setHeader("Set-Cookie", clearCookie(COOKIE_NAMES.session));
  return res.status(204).end();
};
