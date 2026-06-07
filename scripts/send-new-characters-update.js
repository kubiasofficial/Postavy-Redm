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

const channelId = process.argv[2] || "1505429157331337328";

if (!env.DISCORD_BOT_TOKEN) {
  console.error("Missing DISCORD_BOT_TOKEN.");
  process.exit(1);
}

const tomDiscordId = "1506652869770612797";
const ellieDiscordId = "1454130138240520407";
const webUrl = "https://postavy-redm.vercel.app";

const payload = {
  content: `<@${tomDiscordId}> <@${ellieDiscordId}>`,
  allowed_mentions: {
    users: [tomDiscordId, ellieDiscordId]
  },
  embeds: [
    {
      title: "West Haven update: Nove postavy na webu",
      description: [
        "Do seznamu postav pribyli **Thomas \"Tom\" Halbrook** a **Eleanor \"Ellie\" Whitmore**.",
        "",
        "Na hlavni strance zustavaji drby, aktivita i fotky. Samotne karty postav jsou ted schovane pod velkym tlacitkem **Postavy**."
      ].join("\n"),
      color: 12155449,
      fields: [
        {
          name: "Web",
          value: webUrl,
          inline: false
        },
        {
          name: "Jak se dostanes na svoji postavu",
          value: [
            `1. Otevri web: ${webUrl}`,
            "2. Klikni na velke tlacitko **Postavy**.",
            "3. Vyber svoji kartu: **Thomas Halbrook** nebo **Eleanor Whitmore**.",
            "4. Pri prvnim vstupu si potvrdis postavu a vytvoris vlastni 4mistny kod.",
            "5. Pri dalsim vstupu uz se prihlasis timhle kodem."
          ].join("\n"),
          inline: false
        },
        {
          name: "Napojeni",
          value: [
            `<@${tomDiscordId}> je napojeny na **Thomas \"Tom\" Halbrook**.`,
            `<@${ellieDiscordId}> je napojena na **Eleanor \"Ellie\" Whitmore**.`
          ].join("\n"),
          inline: false
        },
        {
          name: "Co tam najdes",
          value: "Detail postavy, lore, povahu, denik, vztahy, stav spanku/vzhuru a odehrany cas.",
          inline: false
        }
      ],
      footer: {
        text: "West Haven Office | nove postavy jsou pripravene"
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
    console.log("New characters update sent.");
  })
  .catch((error) => {
    console.error(`New characters update failed: ${error.message}`);
    process.exit(1);
  });
