const DISCORD_API_BASE = "https://discord.com/api/v10";
const GALLERY_CHANNEL_ID = "1505429527021621278";
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const isPhotoAttachment = (attachment) => {
  const contentType = String(attachment.content_type || "").toLowerCase();
  if (allowedImageTypes.has(contentType)) return true;

  const filename = String(attachment.filename || "").toLowerCase();
  return /\.(jpe?g|png|webp)$/.test(filename);
};

const cleanCaption = (content = "") => (
  String(content)
    .replace(/<a?:[^:>]+:\d+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220)
);

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "Missing DISCORD_BOT_TOKEN" });
  }

  try {
    const response = await fetch(`${DISCORD_API_BASE}/channels/${GALLERY_CHANNEL_ID}/messages?limit=50`, {
      headers: {
        Authorization: `Bot ${token}`
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Discord gallery request failed",
        details: await response.text()
      });
    }

    const messages = await response.json();
    const photos = messages
      .flatMap((message) => (
        Array.isArray(message.attachments)
          ? message.attachments
              .filter(isPhotoAttachment)
              .map((attachment) => ({
                id: attachment.id,
                url: attachment.url,
                proxyUrl: attachment.proxy_url || attachment.url,
                filename: attachment.filename || "photo",
                caption: cleanCaption(message.content),
                width: attachment.width || null,
                height: attachment.height || null,
                uploadedAt: message.timestamp || null
              }))
          : []
      ))
      .slice(0, 24);

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
    return res.status(200).json({ photos });
  } catch (error) {
    return res.status(500).json({ error: "Unable to load Discord gallery" });
  }
};
