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

const handleCommand = async (interaction) => {
  switch (interaction.data?.name) {
    case "wh-stav":
      return handleStatus(interaction);
    case "wh-probudit":
      return handleWake(interaction);
    case "wh-uspat":
      return handleSleep(interaction);
    case "wh-hraci":
      return handlePlayers(interaction);
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
