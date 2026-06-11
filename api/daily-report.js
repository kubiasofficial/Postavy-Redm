const DISCORD_API_BASE = "https://discord.com/api/v10";
const FIREBASE_PROJECT_ID = "postavy-redm";
const FIREBASE_API_KEY = "AIzaSyBXUgRu0V3a2xQG1-r-pEXug5Vdj6nIJyE";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const DAILY_REPORT_CHANNEL_ID = "1511585681586257990";

const hour = 60 * 60 * 1000;
const minute = 60 * 1000;

const maxLevel = 100;
const getLevelThresholdHours = (level) => {
  if (level <= 1) return 0;

  const completedLevels = level - 1;
  return Math.round((completedLevels * 4) + (Math.pow(completedLevels, 1.72) * 0.72));
};
const levelThresholds = Array.from(
  { length: maxLevel },
  (_, index) => getLevelThresholdHours(index + 1) * hour
);
const badgeTiers = [
  { level: 1, name: "Poutnik" },
  { level: 5, name: "Usazeny poutnik" },
  { level: 10, name: "Obcan West Havenu" },
  { level: 15, name: "Mistni hlas" },
  { level: 20, name: "Znama tvar" },
  { level: 30, name: "Starousedlik" },
  { level: 40, name: "Respektovana postava" },
  { level: 50, name: "Legenda mesta" },
  { level: 60, name: "Pilir West Havenu" },
  { level: 75, name: "Ziva kronika" },
  { level: 100, name: "Mytus West Havenu" }
];

const characters = [
  { id: "zeke", name: "Ezekiel Crowe" },
  { id: "silas", name: "Silas Crowe" },
  { id: "william", name: "William Hart" },
  { id: "tom-halbrook", name: "Thomas Halbrook" },
  { id: "ellie-whitmore", name: "Eleanor Whitmore" },
  { id: "violet", name: "Violet Crowe" }
];

const getPragueParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
};

const getPragueDateKey = (date = new Date()) => {
  const parts = getPragueParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const getPreviousPragueDateKey = (date = new Date()) => {
  const parts = getPragueParts(date);
  const currentDayUtc = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  return new Date(currentDayUtc.getTime() - 24 * hour).toISOString().slice(0, 10);
};

const getLevelForTotal = (totalPlayedMs) => {
  let level = 1;
  levelThresholds.forEach((threshold, index) => {
    if (totalPlayedMs >= threshold) {
      level = index + 1;
    }
  });

  return level;
};

const getBadgeForLevel = (level) => {
  let badge = badgeTiers[0];
  badgeTiers.forEach((tier) => {
    if (level >= tier.level) {
      badge = tier;
    }
  });

  return badge;
};

const formatDuration = (durationMs) => {
  const totalMinutes = Math.floor(Math.max(0, Number(durationMs) || 0) / minute);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0 && minutes === 0) return "0min";
  return `${hours > 0 ? `${hours}h ` : ""}${minutes}min`.trim();
};

const firestoreUrl = (path, query = "") => (
  `${FIRESTORE_BASE}/${path}?key=${FIREBASE_API_KEY}${query ? `&${query}` : ""}`
);

const parseFirestoreValue = (value) => {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("nullValue" in value) return null;
  return null;
};

const parseDocument = (document) => {
  const fields = document?.fields || {};
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, parseFirestoreValue(value)])
  );
};

const toFirestoreValue = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  return { stringValue: String(value) };
};

const buildFields = (data) => ({
  fields: Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)])
  )
});

const fetchFirestoreDocument = async (path) => {
  const response = await fetch(firestoreUrl(path));
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Firestore document request failed: ${await response.text()}`);
  }

  return response.json();
};

const fetchFirestoreCollection = async (collection) => {
  const response = await fetch(firestoreUrl(collection));
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`Firestore collection request failed: ${await response.text()}`);
  }

  const data = await response.json();
  return data.documents || [];
};

const patchFirestoreDocument = async (path, data) => {
  const updateMask = Object.keys(data)
    .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join("&");
  const response = await fetch(firestoreUrl(path, updateMask), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildFields(data))
  });

  if (!response.ok) {
    throw new Error(`Firestore update failed: ${await response.text()}`);
  }

  return response.json();
};

const sendDiscordEmbed = async (token, embed) => {
  const response = await fetch(`${DISCORD_API_BASE}/channels/${DAILY_REPORT_CHANNEL_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ embeds: [embed] })
  });

  if (!response.ok) {
    throw new Error(`Discord message failed: ${await response.text()}`);
  }
};

const buildReport = async (reportDateKey, newDateKey, now) => {
  const documents = await fetchFirestoreCollection("characterStates");
  const states = new Map(
    documents.map((document) => [
      decodeURIComponent(document.name.split("/").pop()),
      parseDocument(document)
    ])
  );

  const rows = characters.map((character) => {
    const state = states.get(character.id) || {};
    const totalBefore = Number(state.totalPlayedMs || 0);
    const dailyBefore = state.dailyDate === reportDateKey ? Number(state.dailyPlayedMs || 0) : 0;
    const wakeStartedAt = Number(state.wakeStartedAt || 0);
    const activeSegmentMs = state.status === "awake" && wakeStartedAt > 0
      ? Math.max(0, now - wakeStartedAt)
      : 0;
    const dailyPlayedMs = dailyBefore + activeSegmentMs;
    const totalPlayedMs = totalBefore + activeSegmentMs;
    const level = getLevelForTotal(totalPlayedMs);
    const badge = getBadgeForLevel(level);

    return {
      ...character,
      status: state.status === "awake" ? "vzhuru" : "spi",
      dailyPlayedMs,
      totalPlayedMs,
      level,
      badgeName: badge.name,
      update: state.status === "awake"
        ? {
            status: "awake",
            wakeStartedAt: now,
            totalPlayedMs,
            dailyPlayedMs: 0,
            dailyDate: newDateKey,
            level,
            updatedAt: now
          }
        : {
            dailyPlayedMs: 0,
            dailyDate: newDateKey,
            level,
            updatedAt: now
          }
    };
  });

  return rows;
};

const buildEmbed = (rows, reportDateKey) => ({
  title: "West Haven | Pulnocni souhrn postav",
  description: `Uzaverka dne **${reportDateKey}**. Casy jsou sectene mezi probuzenim a spankem.`,
  color: 0xb88945,
  fields: rows.map((row) => ({
    name: row.name,
    value: [
      `Za den: \`${formatDuration(row.dailyPlayedMs)}\``,
      `Celkem: \`${formatDuration(row.totalPlayedMs)}\``,
      `Level: \`LVL ${row.level}\``,
      `Odznak: \`${row.badgeName}\``,
      `Stav o pulnoci: \`${row.status}\``
    ].join("\n"),
    inline: true
  })),
  footer: {
    text: "West Haven automaticky report | uzaverka predchoziho dne"
  },
  timestamp: new Date().toISOString()
});

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "Missing DISCORD_BOT_TOKEN" });
  }

  const reportSecret = process.env.DAILY_REPORT_SECRET;
  const requestSecret = req.headers.authorization?.replace("Bearer ", "") || req.query.secret;
  const hasReportAccess = reportSecret && requestSecret === reportSecret;
  const preview = req.query.preview === "1" && hasReportAccess;
  const force = req.query.force === "1" && hasReportAccess;

  if ((req.query.preview === "1" || req.query.force === "1") && !hasReportAccess) {
    return res.status(403).json({ error: "Missing or invalid DAILY_REPORT_SECRET" });
  }

  const pragueParts = getPragueParts();

  if (!preview && !force && pragueParts.hour !== "00") {
    return res.status(200).json({
      skipped: true,
      reason: "Not midnight in Europe/Prague"
    });
  }

  const now = Date.now();
  const reportDateKey = req.query.date || getPreviousPragueDateKey();
  const newDateKey = getPragueDateKey();
  const markerPath = `dailyReports/${reportDateKey}`;

  try {
    const existingReport = await fetchFirestoreDocument(markerPath);
    if (!preview && !force && existingReport) {
      return res.status(200).json({
        skipped: true,
        reason: "Report already sent",
        reportDate: reportDateKey
      });
    }

    const rows = await buildReport(reportDateKey, newDateKey, now);
    const embed = buildEmbed(rows, reportDateKey);

    if (preview) {
      return res.status(200).json({ preview: true, reportDate: reportDateKey, embed, rows });
    }

    for (const row of rows) {
      await patchFirestoreDocument(`characterStates/${row.id}`, row.update);
    }

    await sendDiscordEmbed(token, embed);
    await patchFirestoreDocument(markerPath, {
      reportDate: reportDateKey,
      createdAt: now,
      status: "sent"
    });

    return res.status(200).json({
      sent: true,
      reportDate: reportDateKey,
      characters: rows.length
    });
  } catch (error) {
    return res.status(500).json({
      error: "Daily report failed",
      details: error.message
    });
  }
};
