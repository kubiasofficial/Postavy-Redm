const { webcrypto } = require("crypto");
const {
  DISCORD_API_BASE,
  characters,
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
  sendDiscordMessage
} = require("./_west-haven");

const WEBSITE_URL = "https://postavy-redm.vercel.app";
const GALLERY_CHANNEL_ID = "1505429527021621278";

const interactionType = {
  ping: 1,
  applicationCommand: 2
};

const responseType = {
  pong: 1,
  channelMessageWithSource: 4
};

const characterChoices = characters.map((character) => ({
  name: character.name,
  value: character.id
}));

const relationTypes = {
  family: { label: "Rodina", color: 0xd4a459 },
  ally: { label: "Spojenec", color: 0x8fbc8f },
  debt: { label: "Dluh", color: 0xc69a4a },
  distrust: { label: "Neduvera", color: 0x9a6f73 },
  rivalry: { label: "Rivalita", color: 0xb84a4a },
  romance: { label: "Romantika", color: 0xd2789b },
  secret: { label: "Tajemstvi", color: 0x9f8dca }
};

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const characterRelationships = [
  {
    from: "zeke",
    to: "silas",
    type: "family",
    label: "Bratri Croweove",
    note: "Krev je drzi pohromade, i kdyz Zeke mizi do ticha a Silas se snazi najit pravdu mezi slovy druhych."
  },
  {
    from: "zeke",
    to: "violet",
    type: "family",
    label: "Sourozenci Croweovi",
    note: "Violet Zeka zna dost na to, aby se ho nebala slepe. Prave proto mezi nimi zustava opatrnost i nevyslovena loajalita."
  },
  {
    from: "silas",
    to: "violet",
    type: "family",
    label: "Rodinna pamet",
    note: "Silas a Violet umi cist stejne stiny Croweovy rodiny, jen kazdy pouziva jinou zbran."
  },
  {
    from: "violet",
    to: "william",
    type: "ally",
    label: "Tiche spojenectvi",
    note: "William je pro Violet vzacny typ cloveka: nestavi ji do klece a nesnazi se vlastnit jeji tajemstvi."
  },
  {
    from: "zeke",
    to: "william",
    type: "rivalry",
    label: "Ostrazity respekt",
    note: "Zeke respektuje lidi, kteri se nerozklepou pri prvnim pohledu. William mu ale stoji prilis blizko u rodiny."
  },
  {
    from: "tom-halbrook",
    to: "ellie-whitmore",
    type: "romance",
    label: "Novy domov",
    note: "Thomas a Eleanor neprijeli do West Havenu hledat slavu ani moc. Drzi se jeden druheho a spolecne zkousi, jestli se tu da zacit znovu."
  }
];

const characterActionLines = {
  zeke: {
    wakeTitle: "Zeke je vzhuru",
    sleepTitle: "Zeke usnul",
    wake: [
      "Zeke otevrel oci. West Haven ztichl.",
      "Zeke je vzhuru a den se prestal tvarit nevinne.",
      "Na ulici se nic nestalo. Presto lide uhnuli z cesty driv, nez ho videli."
    ],
    sleep: [
      "Zeke usnul. Mesto si dovolilo dychat.",
      "Zeke spi. Nikdo tomu neveri dost na to, aby se prestal ohlizet.",
      "Lampa dohorela. Zeke se nehybe a West Haven si to zapisuje jako vyhru."
    ]
  },
  silas: {
    wakeTitle: "Silas je vzhuru",
    sleepTitle: "Silas odpociva",
    wake: [
      "Silas je vzhuru. Nekdo uz urcite rekl vic, nez mel.",
      "Silas otevrel oci a mesto si zkontrolovalo vlastni lzi.",
      "Pravda se dnes bude schovavat hur nez obvykle."
    ],
    sleep: [
      "Silas odpociva. Tajemstvi zustala sedet u stolu.",
      "Silas spi a i zavrene dvere vypadaji, jako by neco tajily.",
      "Mesto ma chvili bez jeho otazek, ale odpovedi zustaly nervozni."
    ]
  },
  william: {
    wakeTitle: "William je vzhuru",
    sleepTitle: "William spi",
    wake: [
      "William je vzhuru. West Haven ma pevnejsi pudu pod nohama.",
      "William otevrel oci s klidem cloveka, ktery uz prijal odpovednost za den.",
      "Je vzhuru. Potize to vi taky."
    ],
    sleep: [
      "William spi. I jeho odpocinek pusobi jako hlidka.",
      "William odpociva. I tak po nem v mistnosti zustala jistota.",
      "William spi a West Haven se uci stat rovne bez jeho pohledu."
    ]
  },
  "tom-halbrook": {
    wakeTitle: "Tom Halbrook je vzhuru",
    sleepTitle: "Tom Halbrook usnul",
    wake: [
      "Tom Halbrook je vzhuru. Prace si nasla dalsi par rukou.",
      "Tom otevrel oci a den dostal obycejnou, tvrdohlavou silu.",
      "U West Havenu pribyl dalsi pracovity clovek na nohou."
    ],
    sleep: [
      "Tom Halbrook usnul. Den konecne pustil jeho ruce z prace.",
      "Tom odpociva. Ticho kolem nej pusobi poctive odpracovane.",
      "Prace si musi pockat do rana. Tom spi."
    ]
  },
  "ellie-whitmore": {
    wakeTitle: "Ellie je vzhuru",
    sleepTitle: "Ellie usnula",
    wake: [
      "Ellie je vzhuru. West Haven ma o trochu vic klidu.",
      "Eleanor Whitmore je vzhuru a den zni o neco mene tvrde.",
      "Ellie se probudila s klidem cloveka, ktery se nejdriv snazi porozumet."
    ],
    sleep: [
      "Ellie usnula. Nektere starosti dnes konecne ztichly.",
      "Eleanor odpociva. Ticho kolem ni je mekke, ale ne slabe.",
      "Ellie spi a dnesni rozhovory konecne ztratily ostri."
    ]
  },
  violet: {
    wakeTitle: "Violet je vzhuru",
    sleepTitle: "Violet spi",
    wake: [
      "Violet je vzhuru. Ticho v mistnosti se stalo ostrejsim.",
      "Violet otevrela oci a prestalo se plytvat slovy.",
      "West Haven ma od rana pocit, ze ho nekdo cte mezi radky."
    ],
    sleep: [
      "Violet spi. Nektere pohledy presto zustaly sklopene.",
      "Violet odpociva. Nektera tajemstvi se konecne prestala trast.",
      "Violet spi a mistnost si zachovala jeji ticho jako pravidlo."
    ]
  }
};

const pickRandom = (items) => items[Math.floor(Math.random() * items.length)];

const commands = [
  {
    name: "wh-stav",
    description: "Ukaze stav postav ve West Havenu.",
    type: 1,
    options: [
      {
        name: "postava",
        description: "Konkretni postava.",
        type: 3,
        required: false,
        choices: characterChoices
      }
    ]
  },
  {
    name: "wh-prikazy",
    description: "Ukaze prehled West Haven slash prikazu.",
    type: 1
  },
  {
    name: "wh-probudit",
    description: "Prepne tvoji nebo vybranou postavu na vzhuru.",
    type: 1,
    options: [
      {
        name: "postava",
        description: "Postava k probuzeni.",
        type: 3,
        required: false,
        choices: characterChoices
      }
    ]
  },
  {
    name: "wh-uspat",
    description: "Ukonci aktivni cas postavy a ulozi nocni report.",
    type: 1,
    options: [
      {
        name: "postava",
        description: "Postava k uspani.",
        type: 3,
        required: false,
        choices: characterChoices
      },
      {
        name: "report",
        description: "Kratky nocni report.",
        type: 3,
        required: false
      }
    ]
  },
  {
    name: "wh-report",
    description: "Vytvori nahled pulnocniho souhrnu postav.",
    type: 1
  },
  {
    name: "wh-hraci",
    description: "Ukaze Discord hrace napojene na postavy.",
    type: 1
  },
  {
    name: "wh-kronika",
    description: "Ukaze zapis West Haven kroniky.",
    type: 1,
    options: [
      {
        name: "datum",
        description: "Datum ve formatu YYYY-MM-DD. Bez datumu ukaze dnesek nebo posledni zapis.",
        type: 3,
        required: false
      }
    ]
  },
  {
    name: "wh-vztahy",
    description: "Ukaze vztahy vybrane postavy.",
    type: 1,
    options: [
      {
        name: "postava",
        description: "Postava, jejiz vztahy chces zobrazit.",
        type: 3,
        required: false,
        choices: characterChoices
      }
    ]
  },
  {
    name: "wh-kde",
    description: "Ukaze posledni ulozene misto spanku postavy.",
    type: 1,
    options: [
      {
        name: "postava",
        description: "Postava k nalezeni na mape.",
        type: 3,
        required: false,
        choices: characterChoices
      }
    ]
  },
  {
    name: "wh-galerie",
    description: "Ukaze posledni fotky z Discord galerie a odkaz na web.",
    type: 1
  },
  {
    name: "wh-soutez",
    description: "Ukaze aktualni tydenni foto soutez a prubezne poradi.",
    type: 1
  }
];

const getRawBody = async (req) => {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
};

const hexToBytes = (hex) => {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  return Uint8Array.from(hex.match(/.{2}/g).map((byte) => parseInt(byte, 16)));
};

const verifyDiscordRequest = async (req, rawBody) => {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) throw new Error("Missing DISCORD_PUBLIC_KEY");

  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  if (!signature || !timestamp) return false;

  const keyBytes = hexToBytes(publicKey);
  const signatureBytes = hexToBytes(signature);
  if (!keyBytes || !signatureBytes) return false;

  const key = await webcrypto.subtle.importKey("raw", keyBytes, { name: "Ed25519" }, false, ["verify"]);
  return webcrypto.subtle.verify(
    "Ed25519",
    key,
    signatureBytes,
    new TextEncoder().encode(`${timestamp}${rawBody}`)
  );
};

const json = (res, status, payload) => (
  res.status(status).setHeader("Content-Type", "application/json").send(JSON.stringify(payload))
);

const interactionResponse = (content, options = {}) => ({
  type: responseType.channelMessageWithSource,
  data: {
    content,
    flags: options.ephemeral ? 64 : undefined,
    embeds: options.embeds
  }
});

const getOption = (interaction, name) => (
  interaction.data?.options?.find((option) => option.name === name)?.value
);

const adminDiscordIds = () => (
  String(process.env.DISCORD_ADMIN_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);

const canControlCharacter = (userId, characterId) => {
  if (adminDiscordIds().includes(userId)) return true;
  return getCharacter(characterId)?.discordId === userId;
};

const resolveCharacterId = (interaction) => {
  const requestedCharacterId = getOption(interaction, "postava");
  if (requestedCharacterId) return requestedCharacterId;
  return getCharacterByDiscordId(interaction.member?.user?.id || interaction.user?.id)?.id;
};

const mapAspectRatio = 16785 / 21617;
const sleepMapPlaces = [
  { name: "Colter", x: 50.2, y: 5.4, radius: 3 },
  { name: "Lake Isabella", x: 45.5, y: 19.6, radius: 4 },
  { name: "Wapiti", x: 66.6, y: 15.2, radius: 3.5 },
  { name: "Cotorra Springs", x: 64.8, y: 21.4, radius: 3.5 },
  { name: "Bacchus Station", x: 69.2, y: 22.2, radius: 3 },
  { name: "O'Creagh's Run", x: 78.1, y: 20.6, radius: 4 },
  { name: "Annesburg", x: 86.6, y: 23.5, radius: 4 },
  { name: "Butcher Creek", x: 85, y: 28.5, radius: 3.5 },
  { name: "Roanoke Valley", x: 86.2, y: 29, radius: 5 },
  { name: "Valentine", x: 58.4, y: 32.4, radius: 4.5 },
  { name: "Heartland Oil Fields", x: 70.4, y: 32.4, radius: 4 },
  { name: "Van Horn", x: 92.5, y: 33.3, radius: 4 },
  { name: "Wallace Station", x: 50.7, y: 34.3, radius: 3 },
  { name: "Emerald Ranch", x: 78.4, y: 34.5, radius: 4 },
  { name: "Flatneck Station", x: 61.3, y: 44.2, radius: 3 },
  { name: "Strawberry", x: 45.2, y: 45.5, radius: 4.5 },
  { name: "Riggs Station", x: 52.9, y: 46.5, radius: 3 },
  { name: "Shady Belle", x: 82.4, y: 50.9, radius: 4 },
  { name: "Lagras", x: 83.3, y: 47, radius: 4 },
  { name: "Blackwater", x: 53.2, y: 55.2, radius: 5 },
  { name: "Rhodes", x: 73.6, y: 55.2, radius: 4.5 },
  { name: "Saint Denis", x: 86.3, y: 54.5, radius: 5.5 },
  { name: "Manzanita Post", x: 46.8, y: 57.4, radius: 3.5 },
  { name: "Tall Trees", x: 42.8, y: 58, radius: 5 },
  { name: "Braithwaite Manor", x: 77.7, y: 61.1, radius: 4 },
  { name: "Thieves' Landing", x: 49.5, y: 67.2, radius: 4 },
  { name: "Armadillo", x: 31.5, y: 69.1, radius: 4.5 },
  { name: "Tumbleweed", x: 14.5, y: 74.1, radius: 4.5 }
];

const getSleepPlaceDistance = (location, place) => {
  const dx = (Number(location.x || 0) - place.x) * mapAspectRatio;
  const dy = Number(location.y || 0) - place.y;
  return Math.sqrt((dx * dx) + (dy * dy));
};

const getSleepPlaceName = (location) => {
  if (!location) return "";

  const nearest = sleepMapPlaces
    .map((place) => ({ ...place, distance: getSleepPlaceDistance(location, place) }))
    .sort((a, b) => a.distance - b.distance)[0];

  if (!nearest) return "";
  return nearest.distance <= nearest.radius ? nearest.name : `pobliz ${nearest.name}`;
};

const formatMapLocation = (location) => (
  location ? getSleepPlaceName(location) || "misto spanku je vybrane" : "misto neni ulozene"
);

const formatDateTime = (timestamp) => {
  const value = Number(timestamp || 0);
  if (!value) return "nezaznamenano";

  return new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
};

const formatChronicleDate = (dateKey) => {
  if (!dateKey) return getPragueDateKey();
  const [year, month, day] = String(dateKey).split("-").map(Number);
  if (!year || !month || !day) return dateKey;

  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day)));
};

const isValidDateKey = (value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(String(value));

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

const getDiscordAuthorName = (message) => (
  message.member?.nick ||
  message.author?.global_name ||
  message.author?.username ||
  "Neznamy autor"
);

const getPragueWeekInfo = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayIndex = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[values.weekday] || 1;
  const utcNoon = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 12));
  const shiftDateKey = (offsetDays) => (
    new Date(utcNoon.getTime() + (offsetDays * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10)
  );

  return {
    weekId: shiftDateKey(1 - weekdayIndex),
    startsAt: shiftDateKey(1 - weekdayIndex),
    endsAt: shiftDateKey(7 - weekdayIndex)
  };
};

const isKnownCharacterId = (characterId) => characters.some((character) => character.id === characterId);
const hasKnownRelationshipCharacters = (relationship) => (
  isKnownCharacterId(relationship.from) && isKnownCharacterId(relationship.to)
);

const loadStoredRelationships = async () => {
  const documents = await fetchFirestoreCollection("characterRelationships");
  const storedRelationships = documents
    .map((document) => ({ id: document.id, ...document.data }))
    .filter((relationship) => relationship.from && relationship.to && hasKnownRelationshipCharacters(relationship));

  return storedRelationships.length ? storedRelationships : characterRelationships;
};

const fetchLatestGalleryPhotos = async (limit = 5) => {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("Missing DISCORD_BOT_TOKEN");

  const photos = [];
  let before = "";

  while (photos.length < limit) {
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
      if (photos.length >= limit || !Array.isArray(message.attachments)) return;

      message.attachments
        .filter(isPhotoAttachment)
        .forEach((attachment) => {
          if (photos.length >= limit) return;
          photos.push({
            id: attachment.id,
            url: attachment.url,
            proxyUrl: attachment.proxy_url || attachment.url,
            caption: cleanCaption(message.content) || "Fotka bez popisku.",
            authorName: getDiscordAuthorName(message),
            uploadedAt: message.timestamp || null
          });
        });
    });

    before = page[page.length - 1].id;
    if (page.length < 100) break;
  }

  return photos;
};

const buildContestLeaderboard = async (weekId) => {
  const contest = await fetchFirestoreDocument(`photoContests/${weekId}`);
  if (!contest) return null;

  const voteDocuments = await fetchFirestoreCollection("photoContestVotes");
  const counts = voteDocuments
    .map((document) => document.data)
    .filter((vote) => vote.weekId === weekId)
    .reduce((accumulator, vote) => {
      accumulator[vote.photoId] = (accumulator[vote.photoId] || 0) + 1;
      return accumulator;
    }, {});

  const photos = (Array.isArray(contest.photos) ? contest.photos : [])
    .map((photo, index) => ({
      ...photo,
      originalIndex: index,
      votes: counts[photo.id] || 0
    }))
    .sort((first, second) => (
      second.votes - first.votes || first.originalIndex - second.originalIndex
    ));

  return { contest, photos };
};

const stripReportNoise = (text = "") => (
  String(text)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
);

const shorten = (text, maxLength = 260) => {
  const clean = stripReportNoise(text);
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trim()}...`;
};

const getStateRows = async () => {
  const documents = await fetchFirestoreCollection("characterStates");
  const states = new Map(documents.map((document) => [document.id, document.data]));
  const now = Date.now();

  return characters.map((character) => {
    const state = states.get(character.id) || {};
    const activeMs = state.status === "awake" && Number(state.wakeStartedAt || 0) > 0
      ? Math.max(0, now - Number(state.wakeStartedAt))
      : 0;
    const totalPlayedMs = Number(state.totalPlayedMs || 0) + activeMs;

    return {
      character,
      state,
      activeMs,
      totalPlayedMs,
      level: getLevelForTotal(totalPlayedMs)
    };
  });
};

const handleStatus = async (interaction) => {
  const requestedCharacterId = getOption(interaction, "postava");
  const rows = await getStateRows();
  const visibleRows = requestedCharacterId
    ? rows.filter((row) => row.character.id === requestedCharacterId)
    : rows;

  return interactionResponse("", {
    embeds: [
      {
        title: "West Haven | Stav postav",
        color: 0xb88945,
        fields: visibleRows.map(({ character, state, activeMs, totalPlayedMs, level }) => ({
          name: character.name,
          value: [
            `Stav: **${state.status === "awake" ? "vzhuru" : "spi"}**`,
            `Aktualni sezeni: \`${formatDuration(activeMs)}\``,
            `Celkem: \`${formatDuration(totalPlayedMs)}\``,
            `Level: \`LVL ${level}\``
          ].join("\n"),
          inline: true
        })),
        timestamp: new Date().toISOString()
      }
    ]
  });
};

const createAlert = async (characterId, type) => {
  const character = getCharacter(characterId);
  const createdAt = Date.now();
  const profile = characterActionLines[characterId];
  const title = type === "wake"
    ? profile?.wakeTitle || `${character.name} je vzhuru`
    : profile?.sleepTitle || `${character.name} usnul`;
  const text = profile
    ? pickRandom(type === "wake" ? profile.wake : profile.sleep)
    : type === "wake"
      ? `${character.name} se probudil.`
      : `${character.name} usnul.`;

  await patchFirestoreDocument(`characterAlerts/${createdAt}-${characterId}-${type}`, {
    characterId,
    characterName: character.name,
    type,
    title,
    text,
    color: character.color,
    createdAt
  });
};

const writeActivityLog = async ({ action, characterId, timestamp, durationMs = null, actorId = "" }) => {
  const character = getCharacter(characterId);
  const createdAt = Number(timestamp || Date.now());
  const actionLabel = action === "wake" ? "probudila" : "šla spát";
  const durationPart = action === "sleep" && durationMs !== null
    ? ` | sezení ${formatDuration(durationMs)}`
    : "";
  const log = {
    type: "activity",
    title: action === "wake" ? "Postava se probudila" : "Postava šla spát",
    text: `${character?.name || characterId} se ${actionLabel} v ${formatDateTime(createdAt)}.${durationPart}`,
    characterId,
    characterName: character?.name || characterId,
    adminCharacterId: "",
    adminName: "",
    details: {
      action,
      timestamp: createdAt,
      durationMs,
      source: "discord",
      actorId
    },
    createdAt
  };

  try {
    await createFirestoreDocument("adminLogs", `${createdAt}-activity-${characterId}-${action}`, log);
  } catch (error) {
    console.warn(`Activity log failed: ${error.message}`);
  }
};

const handleWake = async (interaction) => {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const characterId = resolveCharacterId(interaction);
  const character = getCharacter(characterId);
  if (!character) return interactionResponse("Nemuzu urcit postavu. Vyber ji parametrem `postava`.", { ephemeral: true });
  if (!canControlCharacter(userId, characterId)) return interactionResponse("Tuhle postavu muze menit jen jeji hrac nebo admin.", { ephemeral: true });

  const now = Date.now();
  await patchFirestoreDocument(`characterStates/${characterId}`, {
    status: "awake",
    wakeStartedAt: now,
    lastAwakeAt: now,
    dailyDate: getPragueDateKey(now),
    updatedAt: now
  });
  await createAlert(characterId, "wake");
  await writeActivityLog({
    action: "wake",
    characterId,
    timestamp: now,
    actorId: userId
  });

  return interactionResponse(`**${character.name}** je vzhuru. Web se aktualizuje pres Firestore.`);
};

const handleSleep = async (interaction) => {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const characterId = resolveCharacterId(interaction);
  const character = getCharacter(characterId);
  if (!character) return interactionResponse("Nemuzu urcit postavu. Vyber ji parametrem `postava`.", { ephemeral: true });
  if (!canControlCharacter(userId, characterId)) return interactionResponse("Tuhle postavu muze menit jen jeji hrac nebo admin.", { ephemeral: true });

  const reportText = String(getOption(interaction, "report") || "").trim();
  const now = Date.now();
  const state = await fetchFirestoreDocument(`characterStates/${characterId}`) || {};
  const startedAt = Number(state.wakeStartedAt || 0);
  const sessionMs = state.status === "awake" && startedAt > 0 ? Math.max(0, now - startedAt) : 0;
  const currentDateKey = getPragueDateKey(now);
  const previousDaily = state.dailyDate === currentDateKey ? Number(state.dailyPlayedMs || 0) : 0;
  const totalPlayedMs = Number(state.totalPlayedMs || 0) + sessionMs;

  await patchFirestoreDocument(`characterStates/${characterId}`, {
    status: "asleep",
    wakeStartedAt: null,
    totalPlayedMs,
    dailyPlayedMs: previousDaily + sessionMs,
    dailyDate: currentDateKey,
    level: getLevelForTotal(totalPlayedMs),
    lastAwakeAt: now,
    updatedAt: now
  });

  await createAlert(characterId, "sleep");
  await writeActivityLog({
    action: "sleep",
    characterId,
    timestamp: now,
    durationMs: sessionMs,
    actorId: userId
  });

  if (reportText) {
    await createFirestoreDocument("nightReports", `${now}-${characterId}`, {
      characterId,
      characterName: character.name,
      reportText,
      sleepLocation: null,
      durationMs: sessionMs,
      reportDate: currentDateKey,
      createdAt: now
    });
  }

  return interactionResponse(`**${character.name}** usnul. Sezeni: \`${formatDuration(sessionMs)}\`.`);
};

const handlePlayers = async () => {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) return interactionResponse("Chybi `DISCORD_BOT_TOKEN` nebo `DISCORD_GUILD_ID`.", { ephemeral: true });

  const members = await fetchDiscordMembers(token, guildId);
  const memberMap = new Map(members.map((member) => [member.user?.id, member]));

  return interactionResponse("", {
    embeds: [
      {
        title: "West Haven | Hráči postav",
        color: 0x5865f2,
        fields: characters.map((character) => {
          const member = memberMap.get(character.discordId);
          const displayName = member
            ? member.nick || member.user.global_name || member.user.username
            : "nenalezen";

          return {
            name: character.name,
            value: member ? `<@${character.discordId}> | ${displayName}` : displayName,
            inline: true
          };
        }),
        thumbnail: members[0]?.user ? { url: getAvatarUrl(members[0].user, members[0], guildId) } : undefined,
        timestamp: new Date().toISOString()
      }
    ]
  });
};

const handleChronicle = async (interaction) => {
  const requestedDate = getOption(interaction, "datum");
  if (!isValidDateKey(requestedDate)) {
    return interactionResponse("Datum zadej ve formatu `YYYY-MM-DD`, treba `2026-06-03`.", { ephemeral: true });
  }

  const documents = await fetchFirestoreCollection("nightReports");
  const reports = documents
    .map((document) => document.data)
    .filter((report) => report.characterId)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

  const targetDate = requestedDate || getPragueDateKey();
  let dayReports = reports.filter((report) => (report.reportDate || getPragueDateKey(report.createdAt)) === targetDate);
  let resolvedDate = targetDate;

  if (dayReports.length === 0 && !requestedDate && reports[0]) {
    resolvedDate = reports[0].reportDate || getPragueDateKey(reports[0].createdAt);
    dayReports = reports.filter((report) => (report.reportDate || getPragueDateKey(report.createdAt)) === resolvedDate);
  }

  if (dayReports.length === 0) {
    return interactionResponse("", {
      embeds: [
        {
          title: "West Haven | Kronika",
          description: `Pro datum **${formatChronicleDate(targetDate)}** zatim neni ulozeny zadny nocni zapis.`,
          color: 0xb88945,
          timestamp: new Date().toISOString()
        }
      ]
    });
  }

  const fields = dayReports.slice(0, 8).map((report) => {
    const character = getCharacter(report.characterId);
    const duration = Number(report.durationMs || 0);
    const location = report.sleepLocation ? `\nStopa: \`${formatMapLocation(report.sleepLocation)}\`` : "";
    const time = duration > 0 ? `\nCas: \`${formatDuration(duration)}\`` : "";

    return {
      name: character?.name || report.characterName || report.characterId,
      value: `${shorten(report.reportText || "Bez textoveho reportu.", 360)}${location}${time}`,
      inline: false
    };
  });

  return interactionResponse("", {
    embeds: [
      {
        title: "West Haven | Kronika",
        description: `Zapis dne **${formatChronicleDate(resolvedDate)}**. Zachyceno stop: **${dayReports.length}**.`,
        color: 0xb88945,
        fields,
        footer: dayReports.length > fields.length
          ? { text: `Zobrazeno ${fields.length}/${dayReports.length} zapisu.` }
          : { text: "West Haven Chronicle" },
        timestamp: new Date().toISOString()
      }
    ]
  });
};

const handleRelations = async (interaction) => {
  const characterId = resolveCharacterId(interaction) || characters[0]?.id;
  const character = getCharacter(characterId);
  if (!character) return interactionResponse("Nemuzu urcit postavu. Vyber ji parametrem `postava`.", { ephemeral: true });

  const relationships = (await loadStoredRelationships()).filter((relationship) => (
    relationship.from === characterId || relationship.to === characterId
  ));

  if (relationships.length === 0) {
    return interactionResponse(`**${character.name}** zatim nema zapsane vztahy.`);
  }

  return interactionResponse("", {
    embeds: [
      {
        title: `West Haven | Vztahy | ${character.name}`,
        color: character.color || 0xb88945,
        fields: relationships.map((relationship) => {
          const otherId = relationship.from === characterId ? relationship.to : relationship.from;
          const other = getCharacter(otherId);
          const type = relationTypes[relationship.type] || relationTypes.secret;

          return {
            name: `${type.label}: ${other?.name || otherId}`,
            value: `**${relationship.label}**\n${relationship.note}`,
            inline: false
          };
        }),
        footer: {
          text: "West Haven Relations"
        },
        timestamp: new Date().toISOString()
      }
    ]
  });
};

const handleWhere = async (interaction) => {
  const characterId = resolveCharacterId(interaction);
  const character = getCharacter(characterId);
  if (!character) return interactionResponse("Nemuzu urcit postavu. Vyber ji parametrem `postava`.", { ephemeral: true });

  const state = await fetchFirestoreDocument(`characterStates/${characterId}`) || {};
  const location = state.sleepLocation;
  const status = state.status === "awake" ? "vzhuru" : "spi";

  return interactionResponse("", {
    embeds: [
      {
        title: `West Haven | Kde je ${character.name}`,
        color: character.color || 0xb88945,
        fields: [
          {
            name: "Posledni misto spanku",
            value: `\`${formatMapLocation(location)}\``,
            inline: false
          },
          {
            name: "Stav",
            value: `\`${status}\``,
            inline: true
          },
          {
            name: "Naposledy vzhuru",
            value: `\`${formatDateTime(state.lastAwakeAt)}\``,
            inline: true
          }
        ],
        footer: {
          text: location ? "Misto je odhadnute podle mapy na webu." : "Postava jeste nema ulozene misto spanku."
        },
        timestamp: new Date().toISOString()
      }
    ]
  });
};

const handleGallery = async () => {
  const photos = await fetchLatestGalleryPhotos(5);

  if (photos.length === 0) {
    return interactionResponse("", {
      embeds: [
        {
          title: "West Haven | Galerie",
          description: `V galerii zatim nejsou zadne fotky. Web: ${WEBSITE_URL}`,
          color: 0xb88945,
          timestamp: new Date().toISOString()
        }
      ]
    });
  }

  return interactionResponse("", {
    embeds: [
      {
        title: "West Haven | Galerie",
        description: [
          "Posledni fotky z Discord galerie jsou nactene primo z kanalu.",
          "Chces mit fotku na webu a v soutezi? Posli ji sem: https://discord.com/channels/1505428362636693595/1505429527021621278",
          `Na webu najdes cely archiv: ${WEBSITE_URL}`
        ].join("\n"),
        color: 0xb88945,
        image: { url: photos[0].proxyUrl || photos[0].url },
        fields: photos.map((photo, index) => ({
          name: `${index + 1}. ${photo.authorName || "Neznamy autor"}`,
          value: shorten(photo.caption || "Fotka bez popisku.", 160),
          inline: false
        })),
        footer: {
          text: "West Haven Gallery"
        },
        timestamp: new Date().toISOString()
      }
    ]
  });
};

const handleContest = async () => {
  const week = getPragueWeekInfo();
  const leaderboard = await buildContestLeaderboard(week.weekId);

  if (!leaderboard) {
    return interactionResponse("", {
      embeds: [
        {
          title: "West Haven | Foto soutez",
          description: [
            `Aktualni tyden **${week.startsAt} az ${week.endsAt}** jeste nema zalozenou soutez.`,
            "Soutez se zaklada kazde pondeli z poslednich 6 fotek v galerii.",
            "Aby se fotka dostala do galerie a mohla byt vybrana do souteze, posli ji sem: https://discord.com/channels/1505428362636693595/1505429527021621278",
            `Hlasovani najdes na webu: ${WEBSITE_URL}`
          ].join("\n"),
          color: 0xb88945,
          timestamp: new Date().toISOString()
        }
      ]
    });
  }

  const fields = leaderboard.photos.slice(0, 6).map((photo, index) => ({
    name: `${index + 1}. misto | ${photo.votes || 0} hlasu`,
    value: [
      photo.caption || "Fotka bez popisku.",
      photo.authorName ? `Autor: ${photo.authorName}` : "Autor neznamy"
    ].join("\n"),
    inline: false
  }));

  return interactionResponse("", {
    embeds: [
      {
        title: "West Haven | Foto soutez",
        description: [
          `Tyden **${leaderboard.contest.startsAt || week.startsAt} az ${leaderboard.contest.endsAt || week.endsAt}**.`,
          "Kazda postava muze hlasovat jednou denne.",
          "Fotky do dalsich kol posilej sem: https://discord.com/channels/1505428362636693595/1505429527021621278",
          `Hlasuj na webu: ${WEBSITE_URL}`
        ].join("\n"),
        color: 0xb88945,
        image: leaderboard.photos[0]?.proxyUrl || leaderboard.photos[0]?.url
          ? { url: leaderboard.photos[0].proxyUrl || leaderboard.photos[0].url }
          : undefined,
        fields,
        footer: {
          text: "Vyhlaseni probiha v nedeli."
        },
        timestamp: new Date().toISOString()
      }
    ]
  });
};

const handleReportPreview = async () => {
  const rows = await getStateRows();
  return interactionResponse("", {
    embeds: [
      {
        title: "West Haven | Nahled pulnocniho reportu",
        description: `Datum: **${getPragueDateKey()}**`,
        color: 0xb88945,
        fields: rows.map(({ character, state, activeMs, totalPlayedMs, level }) => ({
          name: character.name,
          value: [
            `Dnes: \`${formatDuration(Number(state.dailyPlayedMs || 0) + activeMs)}\``,
            `Celkem: \`${formatDuration(totalPlayedMs)}\``,
            `Level: \`LVL ${level}\``,
            `Stav: \`${state.status === "awake" ? "vzhuru" : "spi"}\``
          ].join("\n"),
          inline: true
        })),
        timestamp: new Date().toISOString()
      }
    ]
  });
};

const handleCommandsHelp = async () => (
  interactionResponse("", {
    embeds: [
      {
        title: "West Haven | Slash prikazy",
        description: "Prehled prikazu pro CroweBot.",
        color: 0xb88945,
        fields: [
          {
            name: "/wh-stav",
            value: "Ukaze aktualni stav vsech postav, jejich sezeni, celkovy cas a level."
          },
          {
            name: "/wh-stav postava",
            value: "Ukaze detail jedne vybrane postavy."
          },
          {
            name: "/wh-probudit",
            value: "Prepne tvoji napojenou postavu na vzhuru a aktualizuje web."
          },
          {
            name: "/wh-probudit postava",
            value: "Prepne vybranou postavu na vzhuru. Funguje pro admina nebo vlastnika postavy."
          },
          {
            name: "/wh-uspat",
            value: "Uspe tvoji napojenou postavu, secte odehrany cas a aktualizuje web."
          },
          {
            name: "/wh-uspat report",
            value: "Uspe postavu a ulozi kratky nocni report."
          },
          {
            name: "/wh-report",
            value: "Ukaze nahled pulnocniho souhrnu postav."
          },
          {
            name: "/wh-hraci",
            value: "Ukaze Discord hrace napojene na jednotlive postavy."
          },
          {
            name: "/wh-kronika datum",
            value: "Ukaze zapis kroniky pro zadany den. Bez datumu ukaze dnesek nebo posledni dostupny zapis."
          },
          {
            name: "/wh-vztahy postava",
            value: "Ukaze vztahy vybrane postavy: rodinu, spojence, dluhy, neduveru a rivalitu."
          },
          {
            name: "/wh-kde postava",
            value: "Ukaze posledni ulozene misto spanku postavy a jeji aktualni stav."
          },
          {
            name: "/wh-galerie",
            value: "Ukaze posledni fotky z Discord galerie a odkaz na webovy archiv."
          },
          {
            name: "/wh-soutez",
            value: "Ukaze aktualni tydenni foto soutez, prubezne poradi a pravidla hlasovani."
          },
          {
            name: "/wh-prikazy",
            value: "Ukaze tenhle prehled prikazu."
          }
        ],
        footer: {
          text: "West Haven Office"
        },
        timestamp: new Date().toISOString()
      }
    ],
    ephemeral: true
  })
);

const handleCommand = async (interaction) => {
  switch (interaction.data?.name) {
    case "wh-stav":
      return handleStatus(interaction);
    case "wh-prikazy":
      return handleCommandsHelp(interaction);
    case "wh-probudit":
      return handleWake(interaction);
    case "wh-uspat":
      return handleSleep(interaction);
    case "wh-hraci":
      return handlePlayers(interaction);
    case "wh-kronika":
      return handleChronicle(interaction);
    case "wh-vztahy":
      return handleRelations(interaction);
    case "wh-kde":
      return handleWhere(interaction);
    case "wh-galerie":
      return handleGallery(interaction);
    case "wh-soutez":
      return handleContest(interaction);
    case "wh-report":
      return handleReportPreview(interaction);
    default:
      return interactionResponse("Neznamy prikaz.", { ephemeral: true });
  }
};

const handler = async (req, res) => {
  if (req.method === "GET") {
    return json(res, 200, { ok: true, commands });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const rawBody = await getRawBody(req);
    const verified = await verifyDiscordRequest(req, rawBody);
    if (!verified) return json(res, 401, { error: "Invalid request signature" });

    const interaction = JSON.parse(rawBody);
    if (interaction.type === interactionType.ping) return json(res, 200, { type: responseType.pong });
    if (interaction.type !== interactionType.applicationCommand) {
      return json(res, 400, { error: "Unsupported interaction type" });
    }

    const payload = await handleCommand(interaction);
    return json(res, 200, payload);
  } catch (error) {
    return json(res, 200, interactionResponse(`Bot narazil na chybu: ${error.message}`, { ephemeral: true }));
  }
};

module.exports = handler;
module.exports.config = {
  api: {
    bodyParser: false
  }
};
module.exports.commands = commands;
