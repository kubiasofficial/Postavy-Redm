# West Haven Discord Bot

Bot bezi jako Discord Interactions endpoint na Vercelu:

```text
https://tvoje-domena.vercel.app/api/discord-bot
```

## Env promenne

Nastav ve Vercelu i lokalne podle `.env.example`:

```text
DISCORD_BOT_TOKEN=
DISCORD_PUBLIC_KEY=
DISCORD_APPLICATION_ID=
DISCORD_GUILD_ID=
DISCORD_ADMIN_IDS=
DAILY_REPORT_SECRET=
```

`DISCORD_ADMIN_IDS` je volitelny seznam Discord user ID oddelenych carkou. Admin muze menit vsechny postavy, bez admin prava smi hrac menit jen postavu napojenou v `api/_west-haven.js`.

## Slash prikazy

- `/wh-stav` ukaze stav vsech postav.
- `/wh-stav postava` ukaze jednu postavu.
- `/wh-probudit` probudi tvoji napojenou postavu.
- `/wh-probudit postava` probudi vybranou postavu, pokud jsi admin nebo je tvoje.
- `/wh-uspat report` uspi tvoji postavu, secte cas a ulozi nocni report.
- `/wh-report` ukaze nahled pulnocniho souhrnu.
- `/wh-hraci` ukaze Discord hrace napojene na postavy.
- `/wh-kronika` ukaze dnesni nebo posledni dostupny zapis kroniky.
- `/wh-kronika datum` ukaze kroniku pro datum ve formatu `YYYY-MM-DD`.
- `/wh-vztahy postava` ukaze vztahy vybrane postavy.
- `/wh-kde postava` ukaze posledni ulozene misto spanku postavy.

## Registrace prikazu

Po nastaveni env promennych spust:

```powershell
node scripts\register-discord-commands.js
```

V Discord Developer Portalu nastav u aplikace Interactions Endpoint URL na `/api/discord-bot`. Discord si endpoint overi pres `DISCORD_PUBLIC_KEY`.
