const fs = require("fs");

const loadLocalEnv = () => {
  if (!fs.existsSync(".env.local")) return {};

  return Object.fromEntries(
    fs.readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .filter((line) => line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        const key = line.slice(0, separatorIndex);
        let value = line.slice(separatorIndex + 1).trim();
        if (
          (value.startsWith("\"") && value.endsWith("\"")) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [key, value];
      })
  );
};

const env = {
  ...loadLocalEnv(),
  ...process.env
};

const channelId = process.argv[2];

if (!channelId) {
  console.error("Missing channel id.");
  process.exit(1);
}

if (!env.DISCORD_BOT_TOKEN) {
  console.error("Missing DISCORD_BOT_TOKEN.");
  process.exit(1);
}

const payload = {
  content: "",
  allowed_mentions: {
    parse: []
  },
  embeds: [
    {
      title: "West Haven update",
      description: "Profil postav je uklizeny po posledni uprave. Denik a cile jsou ted primo v pravem profilu nad postou a stare taby Denik, Lokace a Stopy zmizely.",
      color: 12028229,
      fields: [
        {
          name: "Denik",
          value: "Denik uz nevypada jako obycejna klikaci polozka. Zobrazuje se jako osobni zapisky ve stylu stranky a hrac sve postavy muze zapisky mazat.",
          inline: false
        },
        {
          name: "Cile",
          value: "Cile jsou presunute nad tlacitko Posta, aby byly po ruce primo v profilu postavy.",
          inline: false
        },
        {
          name: "Uklid",
          value: "Lokace a Stopy jsou odstranene z hlavniho profilu vcetne starych zbytku v kodu.",
          inline: false
        }
      ],
      footer: {
        text: "West Haven Office | update"
      },
      timestamp: new Date().toISOString()
    }
  ]
};

fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
  method: "POST",
  headers: {
    Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(payload)
})
  .then(async (response) => {
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status} ${body}`);
    }
    console.log("Discord update sent.");
  })
  .catch((error) => {
    console.error(`Discord update failed: ${error.message}`);
    process.exit(1);
  });
