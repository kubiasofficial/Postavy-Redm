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
      title: "West Haven update: Vztahy primo u postav",
      description: [
        "Na webu pribyla nova cast pro vztahy v detailu kazde postavy. Po otevreni postavy ted najdes zalozku **Vztahy**, kde uvidis jen vazby dane postavy na ostatni postavy z webu.",
        "",
        "Vztahy navic dostaly novy vzhled, aby pusobily vic jako cisty osobni spis a bylo hned jasne, kdo je pro postavu spojenec, rodina, rival, dluh, tajemstvi nebo neco mnohem horsiho.",
        "",
        "**Web:** https://postavy-redm.vercel.app"
      ].join("\n"),
      color: 12155449,
      fields: [
        {
          name: "Co je nove",
          value: "Kazda postava ma u sebe vlastni prehled vztahu. Kdyz si ji rozkliknes, uvidis vztahy prave teto postavy s ostatnimi postavami, ne celou sit najednou.",
          inline: false
        },
        {
          name: "Novy vzhled vztahu",
          value: "Vztahy maji novy prehlednejsi vzhled primo v profilu postavy: jmeno druhe postavy, typ vazby a kratka poznamka jsou pohromade v jednom cistym bloku.",
          inline: false
        },
        {
          name: "Soukromi zustava",
          value: "Vztahy a osobni poznamky vidi jen dana postava a admin. Cizi postava tedy neuvidi veci, ktere patri do tveho spisu.",
          inline: false
        },
        {
          name: "Kam kliknout",
          value: "Otevri web, vyber svoji postavu a prejdi na zalozku **Vztahy**.",
          inline: false
        }
      ],
      footer: {
        text: "West Haven Office | vztahy maji novy kabat"
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
