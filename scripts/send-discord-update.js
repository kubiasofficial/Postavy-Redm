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
      title: "🔥 West Haven Update 1.8 | Galerie, Soutěž a nové postavy",
      description: [
        "West Haven se zase posunul o velký kus dál. Update **1.8** přidává samostatnou galerii, týdenní foto soutěž, nové postavy a čistší navigaci na webu.",
        "",
        "Web už není jen seznam postav. Začíná z toho být živá městská kancelář, kronika, nástěnka a archiv příběhů v jednom. 🤠",
        "",
        "🌐 **Web:** https://postavy-redm.vercel.app",
        "📸 **Fotky do galerie a soutěže:** https://discord.com/channels/1505428362636693595/1505429527021621278"
      ].join("\n"),
      color: 12155449,
      fields: [
        {
          name: "📸 Galerie",
          value: "V horním menu je nové tlačítko **Galerie**. Najdeš tam archiv fotek z Discordu, popisek a autora. Hlavní stránka si dál nechává rotátor fotek, takže web zůstává živý i bez klikání.",
          inline: false
        },
        {
          name: "🏆 Týdenní foto soutěž",
          value: "Každé pondělí se vybere posledních **6 fotek** z galerie. Hlasovat se dá **jednou denně**. V neděli se vyhodnotí pořadí a výherci se pošlou do soutěžního kanálu.",
          inline: false
        },
        {
          name: "📌 Jak dostat fotku na web a do soutěže",
          value: "Nahraj fotku do kanálu: https://discord.com/channels/1505428362636693595/1505429527021621278\nJen fotky z tohohle kanálu se berou do galerie a z nich se potom vybírá soutěžní šestice.",
          inline: false
        },
        {
          name: "🤠 Nové postavy",
          value: "Do West Havenu přibyli **Thomas \"Tom\" Mercer** a **Eleanor \"Ellie\" Whitmore**. Jsou napojení na Discord účty a připravení pro další příběhy.",
          inline: false
        },
        {
          name: "🧭 Postavy jako samostatné okno",
          value: "Karty postav jsou nově pod velkým tlačítkem **Postavy**. Hlavní stránka tak zůstává přehlednější, ale rumory, aktivita a rotátor fotek na ní zůstaly.",
          inline: false
        },
        {
          name: "🕸️ Vztahy",
          value: "Stránka **Vztahy** dostala nový design a bot teď bere vztahy z aktuálních dat, aby informace nezůstávaly staré.",
          inline: false
        },
        {
          name: "🤖 Slash příkazy",
          value: [
            "`/wh-stav` - stav postav, čas a levely",
            "`/wh-probudit` / `/wh-uspat` - správa aktivity postavy",
            "`/wh-kronika` - denní zápisy",
            "`/wh-vztahy` - vztahy vybrané postavy",
            "`/wh-kde` - poslední místo spánku",
            "`/wh-galerie` - poslední fotky",
            "`/wh-soutez` - aktuální foto soutěž",
            "`/wh-prikazy` - přehled příkazů"
          ].join("\n"),
          inline: false
        },
        {
          name: "✅ Co dělat teď",
          value: "Otevři web, mrkni na nové menu, nahraj fotku do galerie kanálu a zkus hlasovat v soutěži. Čím víc fotek a zápisů, tím živější West Haven bude. ✨",
          inline: false
        }
      ],
      footer: {
        text: "West Haven Office | Update 1.8"
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
