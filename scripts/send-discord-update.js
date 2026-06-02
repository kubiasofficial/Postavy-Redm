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
  allowed_mentions: {
    parse: []
  },
  embeds: [
    {
      title: "West Haven mini-update",
      description: "CroweBot byl napojen na web a dostal nove slash prikazy. Stav postav, probuzeni, uspani, reporty i prehled hracu ted zvladnete primo z Discordu.",
      color: 12028229,
      fields: [
        {
          name: "Nove prikazy",
          value: "`/wh-stav` `/wh-probudit` `/wh-uspat` `/wh-report` `/wh-hraci` `/wh-prikazy`",
          inline: false
        },
        {
          name: "Co je hotove",
          value: "Bot komunikuje s webem pres Vercel endpoint a uklada zmeny do stejneho systemu postav.",
          inline: false
        }
      ],
      footer: {
        text: "West Haven Office | mini-update"
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
