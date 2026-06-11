const fs = require("fs");

const loadLocalEnv = () => {
  if (!fs.existsSync(".env.local")) return {};

  return Object.fromEntries(
    fs.readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .filter((line) => line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        const key = line.slice(0, separatorIndex).trim();
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
  embeds: [
    {
      title: "West Haven | Úpravy webu a admin menu",
      description: [
        "Na webu proběhlo několik úprav kolem postav, admin nástrojů a vztahů.",
        "",
        "Web: https://postavy-redm.vercel.app"
      ].join("\n"),
      color: 0xa97839,
      fields: [
        {
          name: "Postavy",
          value: "Thomas Mercer byl kompletně odstraněn z webu, vztahových map, Discord příkazů a automatických reportů. Nejde o skrytí, ale odstranění z aktuálního seznamu postav.",
          inline: false
        },
        {
          name: "Admin menu",
          value: "Admin nástroje se přesunuly na samostatnou stránku `admin.html`. Kliknutí na admin ikonu otevře přehlednou kancelář s návratem zpět do hlavního menu.",
          inline: false
        },
        {
          name: "Admin nástroje",
          value: "Z nové admin stránky lze otevřít Night Report, uspání postav, odznaky, vztahy, poštu a broadcast alert. Pokud je admin přihlášený, otevře se rovnou správné okno.",
          inline: false
        },
        {
          name: "Opravy",
          value: "Staré vztahy na odstraněné postavy se už nevrací z databáze do vztahové mapy ani do `/wh-vztahy`. Doplněny byly také syntaktické kontroly pro novou admin stránku.",
          inline: false
        }
      ],
      footer: {
        text: "West Haven Office"
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
    console.log("Discord admin update sent.");
  })
  .catch((error) => {
    console.error(`Discord admin update failed: ${error.message}`);
    process.exit(1);
  });
