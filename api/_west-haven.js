const DISCORD_API_BASE = "https://discord.com/api/v10";
const DISCORD_CDN_BASE = "https://cdn.discordapp.com";
const FIREBASE_PROJECT_ID = "postavy-redm";
const FIREBASE_API_KEY = "AIzaSyBXUgRu0V3a2xQG1-r-pEXug5Vdj6nIJyE";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

const hour = 60 * 60 * 1000;
const minute = 60 * 1000;
const maxLevel = 100;

const characters = [
  { id: "zeke", name: "Ezekiel Crowe", discordId: "417061947759001600", color: 0x95892e },
  { id: "silas", name: "Silas Crowe", discordId: "702917011235143800", color: 0x6161a1 },
  { id: "william", name: "William Hart", discordId: "550294660090691594", color: 0xd870a8 },
  { id: "tom-halbrook", name: "Thomas Halbrook", discordId: "1506652869770612797", color: 0x995d3d },
  { id: "ellie-whitmore", name: "Eleanor Whitmore", discordId: "1454130138240520407", color: 0xc09298 },
  { id: "violet", name: "Violet Crowe", discordId: "795365012494483486", color: 0xd7a8cf }
];

const getLevelThresholdHours = (level) => {
  if (level <= 1) return 0;
  const completedLevels = level - 1;
  return Math.round((completedLevels * 4) + (Math.pow(completedLevels, 1.72) * 0.72));
};

const levelThresholds = Array.from(
  { length: maxLevel },
  (_, index) => getLevelThresholdHours(index + 1) * hour
);

const getCharacter = (id) => characters.find((character) => character.id === id);

const getCharacterByDiscordId = (discordId) => (
  characters.find((character) => character.discordId === discordId)
);

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

const getLevelForTotal = (totalPlayedMs) => {
  let level = 1;
  levelThresholds.forEach((threshold, index) => {
    if (totalPlayedMs >= threshold) level = index + 1;
  });
  return level;
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
  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(parseFirestoreValue);
  }
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, nested]) => [key, parseFirestoreValue(nested)])
    );
  }
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
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, nested]) => [key, toFirestoreValue(nested)])
        )
      }
    };
  }
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

  return parseDocument(await response.json());
};

const fetchFirestoreCollection = async (collection) => {
  const response = await fetch(firestoreUrl(collection));
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`Firestore collection request failed: ${await response.text()}`);
  }

  const data = await response.json();
  return (data.documents || []).map((document) => ({
    id: decodeURIComponent(document.name.split("/").pop()),
    data: parseDocument(document)
  }));
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

const createFirestoreDocument = async (collection, documentId, data) => {
  const response = await fetch(
    `${FIRESTORE_BASE}/${collection}?key=${FIREBASE_API_KEY}&documentId=${encodeURIComponent(documentId)}`,
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildFields(data))
    }
  );

  if (!response.ok) {
    throw new Error(`Firestore create failed: ${await response.text()}`);
  }

  return response.json();
};

const getAvatarExtension = (avatarHash) => (
  avatarHash?.startsWith("a_") ? "gif" : "png"
);

const getAvatarUrl = (user, member, guildId) => {
  if (member.avatar) {
    return `${DISCORD_CDN_BASE}/guilds/${guildId}/users/${user.id}/avatars/${member.avatar}.${getAvatarExtension(member.avatar)}?size=128`;
  }

  if (user.avatar) {
    return `${DISCORD_CDN_BASE}/avatars/${user.id}/${user.avatar}.${getAvatarExtension(user.avatar)}?size=128`;
  }

  const fallbackIndex = Number(user.discriminator || 0) % 5;
  return `${DISCORD_CDN_BASE}/embed/avatars/${fallbackIndex}.png`;
};

const fetchDiscordMembers = async (token, guildId) => {
  const response = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/members?limit=1000`, {
    headers: {
      Authorization: `Bot ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Discord members request failed: ${await response.text()}`);
  }

  return response.json();
};

const sendDiscordMessage = async (token, channelId, payload) => {
  const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Discord message failed: ${await response.text()}`);
  }

  return response.json();
};

const createDiscordDmChannel = async (token, recipientId) => {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ recipient_id: recipientId })
  });

  if (!response.ok) {
    throw new Error(`Discord DM channel failed: ${await response.text()}`);
  }

  return response.json();
};

const sendDiscordDirectMessage = async (token, recipientId, payload) => {
  const channel = await createDiscordDmChannel(token, recipientId);
  return sendDiscordMessage(token, channel.id, payload);
};

module.exports = {
  DISCORD_API_BASE,
  characters,
  createDiscordDmChannel,
  createFirestoreDocument,
  fetchDiscordMembers,
  fetchFirestoreCollection,
  fetchFirestoreDocument,
  formatDuration,
  getAvatarUrl,
  getCharacter,
  getCharacterByDiscordId,
  getLevelForTotal,
  getPragueDateKey,
  patchFirestoreDocument,
  sendDiscordDirectMessage,
  sendDiscordMessage
};
