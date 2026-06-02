const { DISCORD_API_BASE } = require("../api/_west-haven");
const { commands } = require("../api/discord-bot");
const fs = require("fs");
const path = require("path");

const loadLocalEnv = () => {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) return;

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!process.env[key]) process.env[key] = value;
    });
};

loadLocalEnv();

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
