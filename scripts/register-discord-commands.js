const { DISCORD_API_BASE } = require("../api/_west-haven");
const { commands } = require("../api/discord-bot");

const requiredEnv = [
  "DISCORD_BOT_TOKEN",
  "DISCORD_APPLICATION_ID",
  "DISCORD_GUILD_ID"
];

const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing env: ${missing.join(", ")}`);
  process.exit(1);
}

const url = `${DISCORD_API_BASE}/applications/${process.env.DISCORD_APPLICATION_ID}/guilds/${process.env.DISCORD_GUILD_ID}/commands`;

fetch(url, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(commands)
})
  .then(async (response) => {
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status} ${body}`);
    }
    console.log(`Registered ${JSON.parse(body).length} Discord commands.`);
  })
  .catch((error) => {
    console.error(`Command registration failed: ${error.message}`);
    process.exit(1);
  });
