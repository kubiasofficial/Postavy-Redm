const DISCORD_API_BASE = "https://discord.com/api/v10";

const getAvatarUrl = (user, member) => {
  if (member.avatar) {
    return `${DISCORD_API_BASE}/guilds/${process.env.DISCORD_GUILD_ID}/users/${user.id}/avatars/${member.avatar}.png?size=128`;
  }

  if (user.avatar) {
    return `${DISCORD_API_BASE}/users/${user.id}/avatars/${user.avatar}.png?size=128`;
  }

  const fallbackIndex = Number(user.discriminator || 0) % 5;
  return `https://cdn.discordapp.com/embed/avatars/${fallbackIndex}.png`;
};

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !guildId) {
    return res.status(500).json({
      error: "Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID"
    });
  }

  try {
    const response = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/members?limit=1000`, {
      headers: {
        Authorization: `Bot ${token}`
      }
    });

    if (!response.ok) {
      const message = await response.text();
      return res.status(response.status).json({
        error: "Discord API request failed",
        details: message
      });
    }

    const members = await response.json();
    const players = members
      .filter((member) => !member.user?.bot)
      .map((member) => {
        const user = member.user;
        const displayName = member.nick || user.global_name || user.username;

        return {
          id: user.id,
          username: user.username,
          displayName,
          avatarUrl: getAvatarUrl(user, member)
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "cs"));

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ players });
  } catch (error) {
    return res.status(500).json({
      error: "Unable to load Discord members"
    });
  }
};
