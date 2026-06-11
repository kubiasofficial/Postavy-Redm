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

const normalizeUrl = (url = "") => String(url).trim();

const getAuthorName = (message) => (
  message.member?.nick ||
  message.author?.global_name ||
  message.author?.username ||
  "Neznámý autor"
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
    const messages = [];
    let before = "";

    while (true) {
      const search = new URLSearchParams({ limit: "100" });
      if (before) search.set("before", before);

      const response = await fetch(`${DISCORD_API_BASE}/channels/${GALLERY_CHANNEL_ID}/messages?${search}`, {
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

      const page = await response.json();
      if (!Array.isArray(page) || page.length === 0) break;

      messages.push(...page);
      before = page[page.length - 1].id;

      if (page.length < 100) break;
    }

    const photos = messages
      .flatMap((message) => (
        Array.isArray(message.attachments)
          ? message.attachments
              .filter(isPhotoAttachment)
              .map((attachment) => ({
                id: attachment.id,
                url: normalizeUrl(attachment.url),
                proxyUrl: normalizeUrl(attachment.proxy_url || attachment.url),
                filename: attachment.filename || "photo",
                caption: cleanCaption(message.content),
                authorId: message.author?.id || null,
                authorName: getAuthorName(message),
                width: attachment.width || null,
                height: attachment.height || null,
                uploadedAt: message.timestamp || null
              }))
          : []
      ));

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
    return res.status(200).json({ photos });
  } catch (error) {
    return res.status(500).json({ error: "Unable to load Discord gallery" });
  }
};
