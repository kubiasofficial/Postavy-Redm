const { webcrypto } = require("crypto");
const {
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
  secret: { label: "Tajemstvi", color: 0x9f8dca }
};

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
    to: "thomas-mercer",
    type: "distrust",
    label: "Napjata vzdalenost",
    note: "Thomas predstavuje rad a disciplinu. Zeke je vsechno, co se takovemu radu spatne zapisuje do knih."
  },
  {
    from: "silas",
    to: "thomas-mercer",
    type: "secret",
    label: "Otazky bez odpovedi",
    note: "Silas vi, ze Thomas muze byt uzitecny zdroj. Thomas zase tusi, ze Silas se nikdy nepta jen jednou."
  },
  {
    from: "william",
    to: "thomas-mercer",
    type: "debt",
    label: "Nevyrovnany ucet",
    note: "Mezi Williamem a Thomasem lezi veci, ktere nejsou nepratelstvim, ale ani cistym pratelstvim."
  },
  {
    from: "zeke",
    to: "william",
    type: "rivalry",
    label: "Ostrazity respekt",
    note: "Zeke respektuje lidi, kteri se nerozklepou pri prvnim pohledu. William mu ale stoji prilis blizko u rodiny."
  }
];

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

const formatMapLocation = (location) => (
  location
    ? `X ${Math.round(Number(location.x || 0) * 10) / 10}%, Y ${Math.round(Number(location.y || 0) * 10) / 10}%`
    : "misto neni ulozene"
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
  await patchFirestoreDocument(`characterAlerts/${createdAt}-${characterId}-${type}`, {
    characterId,
    characterName: character.name,
    type,
    title: type === "wake" ? `${character.name} je vzhuru` : `${character.name} usnul`,
    text: type === "wake"
      ? `${character.name} se probudil.`
      : `${character.name} usnul.`,
    color: character.color,
    createdAt
  });
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

  const relationships = characterRelationships.filter((relationship) => (
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
          text: location ? "Waypoint je v procentech mapy na webu." : "Postava jeste nema ulozene misto spanku."
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
