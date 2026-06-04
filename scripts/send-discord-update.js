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
      title: "Blizime se k verzi 2.0, ktera by mela byt zatim finalova verze",
      description: [
        "West Haven se posunul o dalsi velky kus dopredu. System postav uz neni jen prehled jmen a casu, ale plnohodnotne RP zazemi pro pribehy, vztahy, mapu, aktivitu a administraci.",
        "",
        "**Web:** https://postavy-redm.vercel.app"
      ].join("\n"),
      color: 12551208,
      fields: [
        {
          name: "Profil postav",
          value: "Detail postav je odlehceny, prehlednejsi a pripraveny pro dlouhodobe RP. Misto preplacanych panelu ted vic pusobi jako osobni spis postavy.",
          inline: false
        },
        {
          name: "Soukromy denik",
          value: "Postavy maji vlastni osobni denik. Videt do nej muze jen dana postava a admin, takze slouzi jako misto pro myslenky, plany a tiche veci mezi radky.",
          inline: false
        },
        {
          name: "WestHaven vztahy",
          value: "Vztahy jsou rozsirene o nove typy vazeb: rodina, pritel, spojenec, duvera, respekt, ochrana, mentor, dluh, tajemstvi, podezreni, vydirani, zrada, rivalita, nenavist, romantika a dalsi.",
          inline: false
        },
        {
          name: "Mapa, lokality a odznaky",
          value: "Mapa je prijemnejsi pri zoomu a vznikl novy automaticky odznak **Znama puda** za opakovany spanek ve stejne lokalite.",
          inline: false
        },
        {
          name: "Admin nastroje",
          value: "Admini maji novou pojistku pro uspani vybrane postavy nebo vsech postav najednou, kdyz nekdo zapomene uspat postavu a vypne PC. Cas se pritom korektne dopocita.",
          inline: false
        },
        {
          name: "Mobilni rozlozeni",
          value: "Rozlozeni pro telefony je cistejsi a pouzitelnejsi, aby slo s postavami pracovat i mimo velky monitor.",
          inline: false
        }
      ],
      footer: {
        text: "West Haven Office | cesta k verzi 2.0"
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
