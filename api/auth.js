const crypto = require("crypto");
const {
  COOKIE_NAMES,
  appUrl,
  clearCookie,
  cookie,
  parseCookies,
  sign,
  verify
} = require("../lib/discord-auth");
const {
  createFirestoreDocument,
  fetchFirestoreCollection,
  fetchFirestoreDocument,
  patchFirestoreDocument,
  sendDiscordMessage
} = require("./_west-haven");
const { handleTournamentRequest } = require("../lib/tournament");

const DISCORD_API = "https://discord.com/api/v10";
const ORGANIZER_ROLE_ID = "1527318124200722472";
const ORGANIZER_CHANNEL_ID = "1527335691141251213";
const REGISTRATION_CHANNEL_ID = "1527322520880021587";
const INTEREST_ROLE_ID = "1527318234015989801";
const PARTICIPANT_ROLE_ID = "1527318296372711575";
const APPLICATIONS_COLLECTION = "tournamentApplications";

const redirectHome = (res, reason) => res.redirect(302, `/?auth=${encodeURIComponent(reason)}`);

const startLogin = (req, res) => {
  const clientId = process.env.DISCORD_APPLICATION_ID;
  if (!clientId || !process.env.DISCORD_CLIENT_SECRET) {
    return res.status(500).send("Discord login is not configured.");
  }

  const state = crypto.randomBytes(24).toString("hex");
  const stateToken = sign({ state, exp: Date.now() + 10 * 60 * 1000 });
  const redirectUri = `${appUrl(req)}/api/auth/discord/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
    state
  });

  res.setHeader("Set-Cookie", cookie(COOKIE_NAMES.state, stateToken, 600));
  return res.redirect(302, `https://discord.com/oauth2/authorize?${params}`);
};

const finishLogin = async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const savedState = verify(cookies[COOKIE_NAMES.state]);
  res.setHeader("Set-Cookie", clearCookie(COOKIE_NAMES.state));

  if (!req.query.code || !req.query.state || savedState?.state !== req.query.state) {
    return redirectHome(res, "invalid-state");
  }

  const redirectUri = `${appUrl(req)}/api/auth/discord/callback`;

  try {
    const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_APPLICATION_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: req.query.code,
        redirect_uri: redirectUri
      })
    });
    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.json().catch(() => ({}));
      console.error("Discord OAuth token exchange failed", {
        status: tokenResponse.status,
        error: tokenError.error,
        errorDescription: tokenError.error_description
      });
      if (tokenError.error === "invalid_client") return redirectHome(res, "oauth-invalid-client");
      if (tokenError.error === "invalid_grant") return redirectHome(res, "oauth-invalid-grant");
      return redirectHome(res, "oauth-failed");
    }

    const token = await tokenResponse.json();
    const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    if (!userResponse.ok) return redirectHome(res, "profile-failed");
    const user = await userResponse.json();

    const memberResponse = await fetch(
      `${DISCORD_API}/guilds/${process.env.DISCORD_GUILD_ID}/members/${user.id}`,
      { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
    );
    if (memberResponse.status === 404) return redirectHome(res, "not-member");
    if (!memberResponse.ok) return redirectHome(res, "membership-check-failed");

    const member = await memberResponse.json();
    const session = sign({
      id: user.id,
      username: user.username,
      displayName: member.nick || user.global_name || user.username,
      avatar: user.avatar,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    });
    res.setHeader("Set-Cookie", cookie(COOKIE_NAMES.session, session, 7 * 24 * 60 * 60));
    return res.redirect(302, "/?auth=success");
  } catch {
    return redirectHome(res, "server-error");
  }
};

const sessionFromRequest = (req) => verify(
  parseCookies(req.headers.cookie)[COOKIE_NAMES.session]
);

const fetchGuildMember = async (discordId) => {
  const response = await fetch(
    `${DISCORD_API}/guilds/${process.env.DISCORD_GUILD_ID}/members/${discordId}`,
    { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Discord member request failed: ${await response.text()}`);
  return response.json();
};

const setDiscordRole = async (discordId, roleId, enabled) => {
  const response = await fetch(`${DISCORD_API}/guilds/${process.env.DISCORD_GUILD_ID}/members/${discordId}/roles/${roleId}`, {
    method: enabled ? "PUT" : "DELETE",
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }
  });
  if (!response.ok && response.status !== 204) throw new Error(`Discord role update failed: ${await response.text()}`);
};

const isOrganizer = (member) => Boolean(member?.roles?.includes(ORGANIZER_ROLE_ID));
const applicationPath = (discordId) => `${APPLICATIONS_COLLECTION}/${discordId}`;

const publicApplication = (application) => application ? ({
  nickname: application.nickname,
  steamProfile: application.steamProfile,
  steamFriendCode: application.steamFriendCode || "",
  country: application.country,
  experience: application.experience,
  note: application.note || "",
  status: application.status,
  rejectionReason: application.rejectionReason || "",
  createdAt: application.createdAt,
  reviewedAt: application.reviewedAt || ""
}) : null;

const getSession = async (req, res) => {
  const session = verify(parseCookies(req.headers.cookie)[COOKIE_NAMES.session]);
  res.setHeader("Cache-Control", "no-store");
  if (!session) return res.status(401).json({ authenticated: false });
  const [member, application] = await Promise.all([
    fetchGuildMember(session.id),
    fetchFirestoreDocument(applicationPath(session.id))
  ]);
  if (!member) return res.status(401).json({ authenticated: false });
  const avatarUrl = session.avatar
    ? `https://cdn.discordapp.com/avatars/${session.id}/${session.avatar}.png?size=128`
    : null;
  return res.status(200).json({
    authenticated: true,
    user: {
      id: session.id,
      username: session.username,
      displayName: session.displayName,
      avatarUrl
    },
    isOrganizer: isOrganizer(member),
    application: publicApplication(application)
  });
};

const cleanString = (value, maxLength) => String(value || "").trim().slice(0, maxLength);

const validateApplication = (body = {}) => {
  const nickname = cleanString(body.nickname, 32);
  const steamProfile = cleanString(body.steamProfile, 220);
  const steamFriendCode = cleanString(body.steamFriendCode, 24);
  const country = cleanString(body.country, 24);
  const experience = cleanString(body.experience, 24);
  const note = cleanString(body.note, 500);

  if (nickname.length < 2) return { error: "Přezdívka musí mít alespoň 2 znaky." };
  let steamUrl;
  try { steamUrl = new URL(steamProfile); } catch { return { error: "Zadej platný odkaz na Steam profil." }; }
  if (steamUrl.protocol !== "https:" || !/(^|\.)steamcommunity\.com$/i.test(steamUrl.hostname)) {
    return { error: "Steam profil musí být odkaz na steamcommunity.com." };
  }
  if (!/^\/(id|profiles)\//i.test(steamUrl.pathname)) return { error: "Zadej přímý odkaz na svůj Steam profil." };
  if (!["Česko", "Slovensko", "Jiná"].includes(country)) return { error: "Vyber zemi." };
  if (!["Začátečník", "Pokročilý", "Veterán"].includes(experience)) return { error: "Vyber zkušenost." };
  if (body.available !== true || body.rulesAccepted !== true) return { error: "Potvrď dostupnost a souhlas s pravidly." };

  return { data: { nickname, steamProfile: steamUrl.toString(), steamFriendCode, country, experience, note } };
};

const submitApplication = async (req, res) => {
  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({ error: "Nejdřív se přihlas přes Discord." });
  const member = await fetchGuildMember(session.id);
  if (!member) return res.status(403).json({ error: "Nejsi členem turnajového serveru." });
  const validation = validateApplication(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const existing = await fetchFirestoreDocument(applicationPath(session.id));
  if (existing?.status === "approved") return res.status(409).json({ error: "Tvoje přihláška už byla schválena." });
  if (existing?.status === "pending") return res.status(409).json({ error: "Tvoje přihláška už čeká na schválení." });

  const now = new Date().toISOString();
  const application = {
    discordId: session.id,
    discordName: session.username,
    displayName: session.displayName,
    discordAvatar: session.avatar || "",
    ...validation.data,
    status: "pending",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    reviewedAt: "",
    reviewedBy: "",
    rejectionReason: ""
  };

  if (existing) await patchFirestoreDocument(applicationPath(session.id), application);
  else await createFirestoreDocument(APPLICATIONS_COLLECTION, session.id, application);

  try {
    await sendDiscordMessage(process.env.DISCORD_BOT_TOKEN, ORGANIZER_CHANNEL_ID, {
    content: `<@&${ORGANIZER_ROLE_ID}> dorazila nová přihláška.`,
    allowed_mentions: { roles: [ORGANIZER_ROLE_ID] },
    embeds: [{
      color: 0xa6ef2f,
      author: {
        name: `${application.displayName} (@${application.discordName})`,
        icon_url: session.avatar ? `https://cdn.discordapp.com/avatars/${session.id}/${session.avatar}.png?size=128` : undefined
      },
      title: "🎨 Nová turnajová přihláška",
      description: `<@${session.id}> právě požádal o vstup do MechaTurnaje.`,
      fields: [
        { name: "Herní přezdívka", value: application.nickname, inline: true },
        { name: "Země", value: application.country, inline: true },
        { name: "Zkušenosti", value: application.experience, inline: true },
        { name: "Steam profil", value: `[Otevřít profil](${application.steamProfile})`, inline: false },
        { name: "Poznámka", value: application.note || "Bez poznámky", inline: false }
      ],
      footer: { text: "Stav: Čeká na schválení • Správa probíhá na webu" },
      timestamp: now
    }]
    });
  } catch (error) {
    console.error("Organizer application notification failed", error.message);
  }

  return res.status(201).json({ application: publicApplication(application) });
};

const listApplications = async (req, res) => {
  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({ error: "Nepřihlášený uživatel." });
  const member = await fetchGuildMember(session.id);
  if (!isOrganizer(member)) return res.status(403).json({ error: "Přístup mají pouze pořadatelé." });

  const applications = (await fetchFirestoreCollection(APPLICATIONS_COLLECTION))
    .map(({ id, data }) => ({ id, ...data }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return res.status(200).json({ applications });
};

const reviewApplication = async (req, res) => {
  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({ error: "Nepřihlášený uživatel." });
  const organizerMember = await fetchGuildMember(session.id);
  if (!isOrganizer(organizerMember)) return res.status(403).json({ error: "Přístup mají pouze pořadatelé." });

  const discordId = cleanString(req.body?.discordId, 24);
  const decision = cleanString(req.body?.decision, 16);
  const reason = cleanString(req.body?.reason, 300);
  if (!/^\d{17,20}$/.test(discordId) || !["approved", "rejected"].includes(decision)) {
    return res.status(400).json({ error: "Neplatné rozhodnutí." });
  }
  if (decision === "rejected" && reason.length < 3) return res.status(400).json({ error: "Napiš důvod zamítnutí." });

  const application = await fetchFirestoreDocument(applicationPath(discordId));
  if (!application) return res.status(404).json({ error: "Přihláška nebyla nalezena." });
  if (application.status !== "pending") return res.status(409).json({ error: "O této přihlášce už bylo rozhodnuto." });

  const now = new Date().toISOString();
  if (decision === "approved") {
    try {
      await setDiscordRole(discordId, PARTICIPANT_ROLE_ID, true);
      await setDiscordRole(discordId, INTEREST_ROLE_ID, false);
    } catch (error) {
      console.error("Participant role swap failed", error);
      return res.status(502).json({ error: "Přihláška zatím nebyla schválena, protože bot nedokázal změnit Discord role." });
    }
  }
  await patchFirestoreDocument(applicationPath(discordId), {
    status: decision,
    reviewedAt: now,
    reviewedBy: session.id,
    rejectionReason: decision === "rejected" ? reason : ""
  });

  if (decision === "approved") {
    try {
      await sendDiscordMessage(process.env.DISCORD_BOT_TOKEN, REGISTRATION_CHANNEL_ID, {
      content: `🎉 <@${discordId}>`,
      allowed_mentions: { users: [discordId] },
      embeds: [{
        color: 0x22b8ef,
        title: "🏆 Nový soutěžící vstupuje do hry!",
        description: `<@${discordId}> byl úspěšně registrován do **MechaTurnaje**.`,
        fields: [
          { name: "Herní přezdívka", value: application.nickname, inline: true },
          { name: "Výzva přijata", value: "Připrav štětce, najdi nejlepší úkryt a nenech se odhalit!", inline: false }
        ],
        footer: { text: "MechaTurnaj • Najdi, nebo buď hledán" },
        timestamp: now
      }]
      });
    } catch (error) {
      console.error("Public registration notification failed", error.message);
    }
  }

  return res.status(200).json({ status: decision });
};

module.exports = async (req, res) => {
  try {
    const action = req.query.action;
    if (action === "discord" && req.method === "GET") return startLogin(req, res);
    if (action === "callback" && req.method === "GET") return finishLogin(req, res);
    if (action === "session" && req.method === "GET") return getSession(req, res);
    if (action === "application" && req.method === "POST") return submitApplication(req, res);
    if (action === "admin-applications" && req.method === "GET") return listApplications(req, res);
    if (action === "review-application" && req.method === "POST") return reviewApplication(req, res);
    if (action.startsWith("tournament-")) return handleTournamentRequest(req, res, action);
    if (action === "logout" && req.method === "POST") {
      res.setHeader("Set-Cookie", clearCookie(COOKIE_NAMES.session));
      return res.status(204).end();
    }
    return res.status(404).json({ error: "Not found" });
  } catch (error) {
    console.error("Tournament auth API failed", error);
    return res.status(500).json({ error: "Server požadavek nedokázal dokončit. Zkus to znovu." });
  }
};
