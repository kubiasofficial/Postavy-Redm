const {
  characters,
  getCharacter,
  sendDiscordDirectMessage
} = require("./_west-haven");

const relationTypes = {
  family: { label: "Rodina", color: 0xd4a459 },
  ally: { label: "Spojenec", color: 0x8fbc8f },
  close: { label: "Přítel", color: 0xd6c48a },
  trust: { label: "Důvěra", color: 0x78b7a4 },
  respect: { label: "Respekt", color: 0x9db3c7 },
  protection: { label: "Ochrana", color: 0x7fb2d0 },
  mentor: { label: "Mentor", color: 0xb8a36a },
  debt: { label: "Dluh", color: 0xc69a4a },
  commonGoal: { label: "Společný cíl", color: 0xb0a05a },
  secret: { label: "Tajemství", color: 0x9f8dca },
  suspicion: { label: "Podezření", color: 0xb08a80 },
  distrust: { label: "Nedůvěra", color: 0x9a6f73 },
  fear: { label: "Strach", color: 0x7f8a93 },
  blackmail: { label: "Vydírání", color: 0x6f5b78 },
  betrayal: { label: "Zrada", color: 0x8f2f3d },
  rivalry: { label: "Rivalita", color: 0xb84a4a },
  hatred: { label: "Nenávist", color: 0xd33f3f },
  romance: { label: "Romantika", color: 0xd2789b },
  tension: { label: "Napětí", color: 0xc080a0 },
  former: { label: "Bývalý vztah", color: 0xa88977 }
};

const readBody = async (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};

const json = (res, status, payload) => (
  res.status(status).setHeader("Content-Type", "application/json").send(JSON.stringify(payload))
);

const makeEmbed = ({ recipient, other, relationship, type }) => ({
  title: `Změna vztahu: ${other.name}`,
  description: relationship.note || "Vztah byl změněn a čeká na odehrání ve hře.",
  color: type.color,
  fields: [
    {
      name: "Tvoje postava",
      value: recipient.name,
      inline: true
    },
    {
      name: "Druhá postava",
      value: other.name,
      inline: true
    },
    {
      name: "Nový stav",
      value: `${relationship.label || `${recipient.name} / ${other.name}`} | ${type.label}`,
      inline: false
    }
  ],
  footer: {
    text: "West Haven Relations"
  },
  timestamp: new Date().toISOString()
});

const handler = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) return json(res, 500, { error: "Missing DISCORD_BOT_TOKEN" });

    const body = await readBody(req);
    const relationship = body.relationship || {};
    if (!relationship.from || !relationship.to || !relationship.type) {
      return json(res, 400, { error: "Missing relationship payload" });
    }

    const from = getCharacter(relationship.from);
    const to = getCharacter(relationship.to);
    if (!from || !to) return json(res, 400, { error: "Unknown relationship character" });

    const type = relationTypes[relationship.type] || relationTypes.secret;
    const recipients = [from, to]
      .filter((character) => character.discordId)
      .map((recipient) => ({
        recipient,
        other: recipient.id === from.id ? to : from
      }));

    const results = await Promise.allSettled(recipients.map(({ recipient, other }) => (
      sendDiscordDirectMessage(token, recipient.discordId, {
        content: `Ahoj <@${recipient.discordId}>, ve West Havenu se změnil vztah tvojí postavy.`,
        embeds: [makeEmbed({ recipient, other, relationship, type })]
      })
    )));

    return json(res, 200, {
      ok: true,
      sent: results.filter((result) => result.status === "fulfilled").length,
      failed: results
        .filter((result) => result.status === "rejected")
        .map((result) => String(result.reason?.message || result.reason))
    });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
};

module.exports = handler;
module.exports.config = {
  api: {
    bodyParser: false
  }
};
