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
  content: "@everyone",
  allowed_mentions: {
    parse: ["everyone"]
  },
  embeds: [
    {
      title: "West Haven update",
      description: "Web postav dostal novou vrstvu pro vztahy, osobni deniky a ukladani lokaci. Kazda postava ma ted vic prostoru na vlastni stopu v pribehu.",
      color: 12028229,
      fields: [
        {
          name: "Vztahy",
          value: "Admin muze vztahy rucne upravovat, navrhy z reportu ukazuji jistotu a duvody, a nocni report ma vztahove tagy.",
          inline: false
        },
        {
          name: "Deniky",
          value: "Kazda postava ma osobni denik. Hrac sve postavy a admin muzou zapisovat a mazat vlastni zapisky.",
          inline: false
        },
        {
          name: "Lokace",
          value: "Postavy si muzou ukladat aktualni waypoint jako pojmenovanou lokaci s poznamkou. Hodi se pro tabory, stopy, tajna mista a dulezite udalosti.",
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
