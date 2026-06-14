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

const channelId = process.argv[2] || "1505429157331337328";
const webUrl = "https://postavy-redm.vercel.app";

if (!env.DISCORD_BOT_TOKEN) {
  console.error("Missing DISCORD_BOT_TOKEN.");
  process.exit(1);
}

const payload = {
  embeds: [
    {
      title: "West Haven | Nové intro a hudba",
      description: [
        "Na web dorazilo nové filmové intro pro West Haven.",
        "",
        `Web: ${webUrl}`
      ].join("\n"),
      color: 0xa97839,
      fields: [
        {
          name: "Co je nové",
          value: [
            "Po otevření webu se zobrazí epické intro s postavami.",
            "Postavy se v kruhu postupně zvýrazňují, ukazují své jméno a krátký lore popis.",
            "Intro má hudbu, světelné efekty a pohyb podle rytmu."
          ].join("\n"),
          inline: false
        },
        {
          name: "Jak to používat",
          value: [
            "1. Otevři web.",
            "2. Intro se spustí jen jednou za aktuální session, aby neotravovalo při každém návratu.",
            "3. Po skončení intra se zobrazí běžné přihlášení jako doteď.",
            "4. Pokud nechceš čekat, klikni na **Přeskočit** nahoře vpravo."
          ].join("\n"),
          inline: false
        },
        {
          name: "Hudba",
          value: [
            "Hudba se pokusí spustit automaticky.",
            "Pokud ji prohlížeč zablokuje, klikni kamkoliv do intra nebo na tlačítko **Vstoupit do West Havenu**.",
            "Písničky **Crowe** a **Legendery Family** se střídají při nových sessions."
          ].join("\n"),
          inline: false
        },
        {
          name: "Když něco nevidíš",
          value: [
            "Dej tvrdý refresh stránky: **Ctrl + F5**.",
            "Pro znovu otestování intra otevři anonymní okno nebo zavři a znovu otevři prohlížeč."
          ].join("\n"),
          inline: false
        }
      ],
      footer: {
        text: "West Haven Office | intro update"
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
    console.log("Intro update sent.");
  })
  .catch((error) => {
    console.error(`Intro update failed: ${error.message}`);
    process.exit(1);
  });
