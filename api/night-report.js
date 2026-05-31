const DISCORD_API_BASE = "https://discord.com/api/v10";
const NIGHT_REPORT_CHANNEL_ID = "1507668908109332560";

const chunkText = (text, maxLength = 3800) => {
  const chunks = [];
  let remaining = text.trim();

  while (remaining.length > maxLength) {
    const cutAt = Math.max(
      remaining.lastIndexOf("\n\n", maxLength),
      remaining.lastIndexOf("\n", maxLength)
    );
    const index = cutAt > 0 ? cutAt : maxLength;
    chunks.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (req.headers["x-west-haven-admin"] !== "zeke") {
    return res.status(403).json({ error: "Only Ezekiel admin can send night reports" });
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "Missing DISCORD_BOT_TOKEN" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch (error) {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }
  const content = String(body?.content || "").trim();
  if (!content) {
    return res.status(400).json({ error: "Missing report content" });
  }

  const embeds = chunkText(content).slice(0, 10).map((description, index) => ({
    title: index === 0 ? "Crowe Family — Night Report" : "Night Report pokračování",
    description,
    color: 0x8f1f2d,
    footer: {
      text: "West Haven Night Office"
    },
    timestamp: new Date().toISOString()
  }));

  try {
    const response = await fetch(`${DISCORD_API_BASE}/channels/${NIGHT_REPORT_CHANNEL_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        embeds
      })
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Discord API request failed",
        details: await response.text()
      });
    }

    return res.status(200).json({ sent: true, embeds: embeds.length });
  } catch (error) {
    return res.status(500).json({ error: "Unable to send night report" });
  }
};
