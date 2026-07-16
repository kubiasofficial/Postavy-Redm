const fs = require("fs");

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      let value = line.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      return [line.slice(0, index).trim(), value];
    })
);

const channelId = process.argv[2];
const webUrl = "https://mechaturnaj.vercel.app/";
if (!channelId || !env.DISCORD_BOT_TOKEN) process.exit(1);

const payload = {
  embeds: [{
    color: 0x22b8ef,
    title: "🦎 CO JE MECHATURNAJ?",
    description: [
      "**MechaTurnaj** je česko-slovenský komunitní turnaj ve hře **Meccha Chameleon**, ve kterém rozhoduje dokonalé maskování, postřeh, rychlost i kreativita.",
      "",
      "Hráči se snaží splynout s prostředím, zatímco se postupně střídají v roli Huntera. Za každého dopadeného hráče získá Hunter jeden bod. Po každém kole se aktualizuje pořadí a část soutěžících může být vyřazena."
    ].join("\n"),
    fields: [
      { name: "🟢 1. Kolo — Klasická hra", value: "Čisté maskování bez zvláštních omezení. Každý aktivní hráč se vystřídá jako Hunter." },
      { name: "🟠 2. Kolo — Živé sochy", value: "Hráči se schovávají na viditelných místech. Po bodování rozdělí přidělené body mezi ostatní soutěžící." },
      { name: "🔵 3. Kolo — Rychlé maskování", value: "Na vytvoření převleku je omezený čas. Po jeho vypršení se už maskování nesmí upravovat." },
      { name: "🟣 4. Kolo — Kreativní chaos", value: "Kromě úkrytu rozhoduje originalita. Každý aktivní hráč rozdělí deset bodů mezi kreativní soupeře." },
      { name: "🔴 5. Kolo — Poslední šance", value: "Do finále postoupí poslední čtyři hráči a všechny body získané v tomto kole se násobí dvěma." },
      { name: "❌ Vyřazení není konec sledování", value: "Vyřazený hráč už neboduje ani nehlasuje, ale dál může sledovat celý živý průběh turnaje jako divák." },
      { name: "🏆 Hlavní výhra", value: "Celkový vítěz získá hru **Mafia: Domovina**. Výhra bude do 24 hodin připsána na jeho Steam účet." },
      { name: "🎉 Hlavně pro zábavu", value: "Nejde o profesionální soutěž. Cílem je férový komunitní večer, napětí, kreativita a pořádná dávka zábavy." }
    ],
    footer: { text: "MechaTurnaj • Pět kol • Jeden vítěz • Najdi, nebo buď hledán" },
    timestamp: new Date().toISOString()
  }],
  components: [{
    type: 1,
    components: [{ type: 2, style: 5, label: "Zjistit více na webu", emoji: { name: "🦎" }, url: webUrl }]
  }]
};

fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
  method: "POST",
  headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify(payload)
}).then(async (response) => {
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  console.log("Tournament about message sent.");
}).catch((error) => {
  console.error(`Tournament about message failed: ${error.message}`);
  process.exit(1);
});
