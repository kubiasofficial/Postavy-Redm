const fs = require("fs");

const loadEnv = () => Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      return [key, value];
    })
);

const env = { ...loadEnv(), ...process.env };
const channelId = process.argv[2];
const webUrl = "https://mechaturnaj.vercel.app/";

if (!channelId || !env.DISCORD_BOT_TOKEN) process.exit(1);

const payload = {
  embeds: [{
    color: 0xa6ef2f,
    title: "🎨 VSTUP DO MECHATURNAJE JE OTEVŘEN!",
    description: [
      "Dokážeš splynout s okolím, přelstít Huntera a dojít až do velkého finále?",
      "",
      "Připoj se k česko-slovenskému komunitnímu turnaji **Meccha Chameleon** a bojuj o hlavní výhru **Mafia: Domovina**."
    ].join("\n"),
    fields: [
      {
        name: "📋 Jak se přihlásit?",
        value: [
          "**1.** Otevři turnajový web tlačítkem níže.",
          "**2.** Přihlas se pomocí svého Discord účtu.",
          "**3.** Klikni na **Podat přihlášku**.",
          "**4.** Vyplň herní přezdívku a Steam profil.",
          "**5.** Počkej na schválení organizačním týmem."
        ].join("\n")
      },
      {
        name: "🏆 Co tě čeká?",
        value: "Pět originálních kol, střídání Hunterů, kreativní hlasování, živé výsledky a velké finále posledních čtyř hráčů."
      },
      {
        name: "👁 Nechceš soutěžit?",
        value: "Turnaj můžeš na webu sledovat také jako divák — živé pořadí a průběh se aktualizují automaticky."
      }
    ],
    footer: { text: "MechaTurnaj • Najdi, nebo buď hledán" },
    timestamp: new Date().toISOString()
  }],
  components: [{
    type: 1,
    components: [{ type: 2, style: 5, label: "Přihlásit se do turnaje", emoji: { name: "🎨" }, url: webUrl }]
  }]
};

fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
  method: "POST",
  headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify(payload)
}).then(async (response) => {
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  console.log("Tournament invite sent.");
}).catch((error) => {
  console.error(`Tournament invite failed: ${error.message}`);
  process.exit(1);
});
