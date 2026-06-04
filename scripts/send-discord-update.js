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
      description: "Dnes jsme upravili profil postav, mobilni rozlozeni, mapu a vratili osobni RP zapisky v lepsi podobe.",
      color: 12028229,
      fields: [
        {
          name: "Profil postavy",
          value: "Detail postav je lehci, ma jemnejsi zalozky, prehlednejsi metadata a mene tezkych panelu.",
          inline: false
        },
        {
          name: "Soukrome zapisky",
          value: "Do profilu se vratil osobni denik. Vidi ho jen dana postava a admin, vcetne moznosti zapisy mazat.",
          inline: false
        },
        {
          name: "WestHaven vztahy",
          value: "Kazda postava si muze soukrome zapsat vlastni vztahy: jmeno, typ vazby a volitelny popis. Typy vazeb jsou rozsirene.",
          inline: false
        },
        {
          name: "Mapa a mobil",
          value: "Mapa pri zoomu pouziva ostrejsi vykreslovani a rozlozeni pro telefony je kompaktnejsi.",
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
