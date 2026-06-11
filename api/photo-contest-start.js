const {
  createFirestoreDocument,
  fetchFirestoreDocument,
  patchFirestoreDocument
} = require("./_west-haven");

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

const getStableUrl = (url = "") => String(url).split("?")[0];

const getAuthorName = (message) => (
  message.member?.nick ||
  message.author?.global_name ||
  message.author?.username ||
  "Neznámý autor"
);

const getPragueDayInfo = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayIndex = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[values.weekday] || 1;

  return {
    weekdayIndex,
    utcNoon: new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 12))
  };
};

const shiftDateKey = (utcNoonDate, offsetDays) => {
  const shifted = new Date(utcNoonDate.getTime() + (offsetDays * 24 * 60 * 60 * 1000));
  return shifted.toISOString().slice(0, 10);
};

const getCurrentWeek = () => {
  const dayInfo = getPragueDayInfo();
  const startsAt = shiftDateKey(dayInfo.utcNoon, 1 - dayInfo.weekdayIndex);

  return {
    weekId: startsAt,
    startsAt,
    endsAt: shiftDateKey(dayInfo.utcNoon, 7 - dayInfo.weekdayIndex)
  };
};

const fetchLatestPhotos = async (token) => {
  const photos = [];
  let before = "";

  while (photos.length < 6) {
    const search = new URLSearchParams({ limit: "100" });
    if (before) search.set("before", before);

    const response = await fetch(`${DISCORD_API_BASE}/channels/${GALLERY_CHANNEL_ID}/messages?${search}`, {
      headers: {
        Authorization: `Bot ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Discord gallery request failed: ${await response.text()}`);
    }

    const page = await response.json();
    if (!Array.isArray(page) || page.length === 0) break;

    page.forEach((message) => {
      if (photos.length >= 6 || !Array.isArray(message.attachments)) return;

      message.attachments
        .filter(isPhotoAttachment)
        .forEach((attachment) => {
          if (photos.length >= 6) return;
          photos.push({
            id: attachment.id,
            url: getStableUrl(attachment.url),
            proxyUrl: getStableUrl(attachment.proxy_url || attachment.url),
            filename: attachment.filename || "photo",
            caption: cleanCaption(message.content) || "Fotka bez popisku.",
            authorId: message.author?.id || null,
            authorName: getAuthorName(message),
            uploadedAt: message.timestamp || null
          });
        });
    });

    before = page[page.length - 1].id;
    if (page.length < 100) break;
  }

  return photos;
};

module.exports = async (req, res) => {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "Missing DISCORD_BOT_TOKEN" });
  }

  const week = getCurrentWeek();
  const force = req.query.force === "1" || Boolean(req.body?.force);

  try {
    const existing = await fetchFirestoreDocument(`photoContests/${week.weekId}`);
    const hasExistingPhotos = Array.isArray(existing?.photos) && existing.photos.length > 0;
    if (existing && hasExistingPhotos && !force) {
      return res.status(200).json({ skipped: true, reason: "Photo contest already exists", weekId: week.weekId });
    }

    const contest = {
      id: week.weekId,
      weekId: week.weekId,
      startsAt: week.startsAt,
      endsAt: week.endsAt,
      status: "active",
      photos: await fetchLatestPhotos(token),
      createdAt: Date.now()
    };

    if (contest.photos.length === 0) {
      return res.status(404).json({ error: "No photos available for contest", weekId: week.weekId });
    }

    if (existing) {
      await patchFirestoreDocument(`photoContests/${week.weekId}`, contest);
    } else {
      await createFirestoreDocument("photoContests", week.weekId, contest);
    }

    return res.status(200).json({ ok: true, weekId: week.weekId, photoCount: contest.photos.length });
  } catch (error) {
    return res.status(500).json({
      error: "Unable to start photo contest",
      details: error.message
    });
  }
};
