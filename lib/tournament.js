const crypto = require("crypto");
const { COOKIE_NAMES, parseCookies, verify } = require("./discord-auth");
const {
  createFirestoreDocument,
  fetchFirestoreCollection,
  fetchFirestoreDocument,
  patchFirestoreDocument,
  sendDiscordMessage
} = require("../api/_west-haven");

const DISCORD_API = "https://discord.com/api/v10";
const ORGANIZER_ROLE_ID = "1527318124200722472";
const WINNER_CHANNEL_ID = "1527358114792476813";
const ELIMINATION_CHANNEL_ID = "1527349687651139716";
const STATE_PATH = "tournament/main";
const PLAYERS_COLLECTION = "tournamentPlayers";
const VOTES_COLLECTION = "tournamentVotes";

const ROUND_NAMES = {
  1: "Klasická hra",
  2: "Živé sochy",
  3: "Rychlé maskování",
  4: "Kreativní chaos",
  5: "Poslední šance"
};

const sessionFromRequest = (req) => verify(parseCookies(req.headers.cookie)[COOKIE_NAMES.session]);
const now = () => new Date().toISOString();
const cleanString = (value, max = 200) => String(value || "").trim().slice(0, max);
const asInt = (value, min, max) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
};

const fetchMember = async (id) => {
  const response = await fetch(`${DISCORD_API}/guilds/${process.env.DISCORD_GUILD_ID}/members/${id}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Discord member request failed: ${await response.text()}`);
  return response.json();
};

const requireSession = async (req) => {
  const session = sessionFromRequest(req);
  if (!session) throw Object.assign(new Error("Nejdřív se přihlas přes Discord."), { status: 401 });
  return session;
};

const requireOrganizer = async (req) => {
  const session = await requireSession(req);
  const member = await fetchMember(session.id);
  if (!member?.roles?.includes(ORGANIZER_ROLE_ID)) {
    throw Object.assign(new Error("Tuto akci může provést pouze pořadatel."), { status: 403 });
  }
  return session;
};

const defaultState = () => ({
  status: "not_started",
  runId: "",
  phase: "waiting",
  currentRound: 0,
  players: [],
  readyIds: [],
  eliminated: {},
  hunterOrder: [],
  hunterIndex: 0,
  hunterResults: {},
  roundScores: {},
  voteBudget: 0,
  finalResults: [],
  auditLog: [],
  updatedAt: now()
});

const getState = async () => (await fetchFirestoreDocument(STATE_PATH)) || defaultState();
const saveState = async (state) => {
  state.updatedAt = now();
  await patchFirestoreDocument(STATE_PATH, state);
  return state;
};

const addAudit = (state, admin, action, detail = "") => {
  state.auditLog = [...(state.auditLog || []), { at: now(), adminId: admin.id, adminName: admin.displayName, action, detail }].slice(-100);
};

const activePlayers = (state) => state.players.filter((player) => !state.eliminated?.[player.id]);
const participatingPlayers = (state) => state.players.filter((player) => {
  const eliminatedRound = Number(state.eliminated?.[player.id]?.round || 99);
  return eliminatedRound >= Number(state.currentRound || 0);
});
const shuffle = (items) => items.map((value) => ({ value, sort: crypto.randomInt(0, 1_000_000) })).sort((a, b) => a.sort - b.sort).map(({ value }) => value);

const setupRound = (state, round) => {
  state.currentRound = round;
  state.phase = "round_intro";
  state.hunterOrder = shuffle(activePlayers(state).map((player) => player.id));
  state.hunterIndex = 0;
  state.hunterResults = {};
  state.voteBudget = round === 4 ? 10 : 0;
  state.roundScores = state.roundScores || {};
  state.roundScores[String(round)] = { admin: {}, hunter: {}, peer: {}, total: {} };
};

const scoreFor = (state, playerId) => Object.values(state.roundScores || {}).reduce((sum, round) => sum + Number(round.total?.[playerId] || 0), 0);
const ranking = (state) => state.players.map((player) => ({
  ...player,
  score: scoreFor(state, player.id),
  eliminated: Boolean(state.eliminated?.[player.id]),
  eliminatedRound: state.eliminated?.[player.id]?.round || null
})).sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname, "cs"));

const publicState = (state, viewerId = null) => ({
  status: state.status,
  phase: state.phase,
  currentRound: state.currentRound,
  roundName: ROUND_NAMES[state.currentRound] || "Turnaj",
  players: ranking(state),
  readyIds: state.readyIds || [],
  currentHunterId: state.phase === "hunter_turns" ? state.hunterOrder?.[state.hunterIndex] || null : null,
  hunterProgress: { completed: Object.keys(state.hunterResults || {}).length, total: state.hunterOrder?.length || 0 },
  voteBudget: state.voteBudget || 0,
  hasVoted: viewerId ? Boolean(state.viewerVoteIds?.includes(viewerId)) : false,
  finalResults: state.phase === "podium" ? state.finalResults : [],
  updatedAt: state.updatedAt
});

const loadVoteIds = async (round, runId = "") => (await fetchFirestoreCollection(VOTES_COLLECTION))
  .filter(({ data }) => Number(data.round) === Number(round) && String(data.runId || "legacy") === String(runId || "legacy"))
  .map(({ data }) => data.voterId);

const getPublicState = async (req, res) => {
  const state = await getState();
  const session = sessionFromRequest(req);
  state.viewerVoteIds = state.phase === "voting" ? await loadVoteIds(state.currentRound, state.runId) : [];
  const application = session ? await fetchFirestoreDocument(`tournamentApplications/${session.id}`) : null;
  return res.status(200).json({
    tournament: publicState(state, session?.id),
    viewer: {
      id: session?.id || null,
      approved: application?.status === "approved",
      ready: Boolean(session && state.readyIds?.includes(session.id)),
      eliminated: Boolean(session && state.eliminated?.[session.id])
    }
  });
};

const joinLobby = async (req, res) => {
  const session = await requireSession(req);
  const application = await fetchFirestoreDocument(`tournamentApplications/${session.id}`);
  if (application?.status !== "approved") throw Object.assign(new Error("Do čekárny mohou jen schválení soutěžící."), { status: 403 });
  const state = await getState();
  if (state.status !== "lobby") throw Object.assign(new Error("Čekárna právě není otevřená."), { status: 409 });
  if (!state.players.some((player) => player.id === session.id)) throw Object.assign(new Error("Nejsi v sestavě tohoto turnaje."), { status: 403 });
  state.readyIds = [...new Set([...(state.readyIds || []), session.id])];
  await saveState(state);
  return res.status(200).json({ ready: true });
};

const submitVote = async (req, res) => {
  const session = await requireSession(req);
  const state = await getState();
  if (state.phase !== "voting" || ![2, 4].includes(Number(state.currentRound))) throw Object.assign(new Error("Hlasování právě není otevřené."), { status: 409 });
  if (state.eliminated?.[session.id]) throw Object.assign(new Error("Vyřazený hráč už nemůže hlasovat."), { status: 403 });
  if (!activePlayers(state).some((player) => player.id === session.id)) throw Object.assign(new Error("Nejsi aktivní hráč."), { status: 403 });

  const allocations = req.body?.allocations && typeof req.body.allocations === "object" ? req.body.allocations : {};
  const activeIds = new Set(activePlayers(state).map((player) => player.id));
  let total = 0;
  const cleaned = {};
  for (const [recipientId, rawPoints] of Object.entries(allocations)) {
    if (recipientId === session.id) throw Object.assign(new Error("Nemůžeš hlasovat sám pro sebe."), { status: 400 });
    if (!activeIds.has(recipientId)) throw Object.assign(new Error("Body lze dát pouze aktivnímu hráči."), { status: 400 });
    const points = asInt(rawPoints, 0, state.voteBudget);
    if (points === null) throw Object.assign(new Error("Neplatný počet bodů."), { status: 400 });
    if (points > 0) cleaned[recipientId] = points;
    total += points;
  }
  if (total !== Number(state.voteBudget)) throw Object.assign(new Error(`Musíš rozdělit přesně ${state.voteBudget} bodů.`), { status: 400 });
  const voteId = `${state.runId || "legacy"}-${state.currentRound}-${session.id}`;
  const existing = await fetchFirestoreDocument(`${VOTES_COLLECTION}/${voteId}`);
  if (existing) throw Object.assign(new Error("Hlasování už bylo odevzdané."), { status: 409 });
  await createFirestoreDocument(VOTES_COLLECTION, voteId, { runId: state.runId || "legacy", round: state.currentRound, voterId: session.id, allocations: cleaned, createdAt: now() });
  return res.status(201).json({ submitted: true });
};

const initializePlayers = async () => {
  const applications = (await fetchFirestoreCollection("tournamentApplications"))
    .filter(({ data }) => data.status === "approved")
    .map(({ id, data }) => ({
      id,
      nickname: data.nickname,
      displayName: data.displayName,
      username: data.discordName,
      avatar: data.discordAvatar || "",
      steamProfile: data.steamProfile
    }));
  if (!applications.length) throw Object.assign(new Error("Nejsou žádní schválení hráči."), { status: 409 });
  for (const player of applications) {
    const existing = await fetchFirestoreDocument(`${PLAYERS_COLLECTION}/${player.id}`);
    if (existing) await patchFirestoreDocument(`${PLAYERS_COLLECTION}/${player.id}`, { ...player, ready: false, updatedAt: now() });
    else await createFirestoreDocument(PLAYERS_COLLECTION, player.id, { ...player, ready: false, createdAt: now() });
  }
  return applications;
};

const completeHunter = (state, body) => {
  if (state.phase !== "hunter_turns") throw Object.assign(new Error("Hunter rotace právě neprobíhá."), { status: 409 });
  const hunterId = state.hunterOrder[state.hunterIndex];
  const caught = asInt(body?.caught, 0, Math.max(0, participatingPlayers(state).length - 1));
  if (caught === null) throw Object.assign(new Error("Zadej platný počet dopadených hráčů."), { status: 400 });
  state.hunterResults[hunterId] = { caught, points: caught, completedAt: now() };
  state.roundScores[String(state.currentRound)].hunter[hunterId] = caught;
  state.hunterIndex += 1;
  if (state.hunterIndex >= state.hunterOrder.length) state.phase = "scoring";
  return `${hunterId}: ${caught} dopadených`;
};

const applyScoring = async (state, body) => {
  if (state.phase !== "scoring") throw Object.assign(new Error("Bodování ještě není odemčené."), { status: 409 });
  const participants = participatingPlayers(state);
  const ids = new Set(participants.map((player) => player.id));
  const adminScores = {};
  for (const player of participants) {
    const points = asInt(body?.scores?.[player.id] ?? 0, 0, Number.MAX_SAFE_INTEGER);
    if (points === null) throw Object.assign(new Error(`Neplatné body hráče ${player.nickname}.`), { status: 400 });
    adminScores[player.id] = points;
  }
  const eliminatedIds = [...new Set(Array.isArray(body?.eliminatedIds) ? body.eliminatedIds : [])];
  if (eliminatedIds.some((id) => !ids.has(id))) throw Object.assign(new Error("Nelze vyřadit neaktivního hráče."), { status: 400 });
  const remaining = activePlayers(state).length - eliminatedIds.length;
  const fullTournament = state.players.length >= 4;
  if (remaining < 1) throw Object.assign(new Error("V turnaji musí zůstat alespoň jeden aktivní hráč."), { status: 400 });
  if (fullTournament && state.currentRound < 4 && remaining < 4) throw Object.assign(new Error("Před finále musí zůstat alespoň 4 hráči."), { status: 400 });
  if (fullTournament && state.currentRound === 4 && remaining !== 4) throw Object.assign(new Error("Do pátého kola musí postoupit přesně 4 hráči."), { status: 400 });

  const round = state.roundScores[String(state.currentRound)];
  round.admin = adminScores;
  for (const id of eliminatedIds) {
    state.eliminated[id] = { round: state.currentRound, at: now() };
    const player = state.players.find((item) => item.id === id);
    try {
      await sendDiscordMessage(process.env.DISCORD_BOT_TOKEN, ELIMINATION_CHANNEL_ID, {
        content: `<@${id}>`, allowed_mentions: { users: [id] },
        embeds: [{ color: 0xed3d74, title: "❌ Hráč byl vyřazen", description: `<@${id}> končí v ${state.currentRound}. kole **${ROUND_NAMES[state.currentRound]}**.`, fields: [{ name: "Soutěžící", value: player?.nickname || `<@${id}>` }, { name: "Co dál?", value: "Průběh turnaje můžeš dál sledovat v režimu diváka." }], timestamp: now() }]
      });
    } catch (error) { console.error("Elimination notification failed", error.message); }
  }
  state.phase = [2, 4].includes(Number(state.currentRound)) ? "voting" : "ready_to_publish";
  state.voteBudget = state.currentRound === 2 ? (asInt(body?.voteBudget, 5, 30) || 5) : state.currentRound === 4 ? 10 : 0;
};

const finalizeRoundTotals = async (state) => {
  const round = state.roundScores[String(state.currentRound)];
  round.peer = {};
  if ([2, 4].includes(Number(state.currentRound))) {
    const votes = (await fetchFirestoreCollection(VOTES_COLLECTION)).filter(({ data }) => Number(data.round) === Number(state.currentRound) && String(data.runId || "legacy") === String(state.runId || "legacy"));
    const eligibleIds = activePlayers(state).map((player) => player.id);
    if (votes.filter(({ data }) => eligibleIds.includes(data.voterId)).length < eligibleIds.length) {
      throw Object.assign(new Error("Ještě nehlasovali všichni aktivní hráči."), { status: 409 });
    }
    votes.forEach(({ data }) => Object.entries(data.allocations || {}).forEach(([id, points]) => { round.peer[id] = Number(round.peer[id] || 0) + Number(points); }));
  }
  const multiplier = Number(state.currentRound) === 5 ? 2 : 1;
  state.players.forEach((player) => {
    const raw = Number(round.hunter?.[player.id] || 0) + Number(round.admin?.[player.id] || 0) + Number(round.peer?.[player.id] || 0);
    round.total[player.id] = raw * multiplier;
  });
  state.phase = "round_results";
};

const announceWinners = async (state) => {
  state.finalResults = ranking(state);
  state.phase = "podium";
  state.status = "published";
  const [winner, second, third] = state.finalResults;
  const winnerDetails = state.players.find((player) => player.id === winner?.id);
  const winnerBreakdown = winner ? Object.entries(state.roundScores || {}).map(([round, scores]) => (
    `${round}. kolo: **${Number(scores.total?.[winner.id] || 0)} bodů**`
  )).join("\n") : "—";
  await sendDiscordMessage(process.env.DISCORD_BOT_TOKEN, WINNER_CHANNEL_ID, {
    content: winner ? `🏆 <@${winner.id}>` : "🏆 Výsledky MechaTurnaje",
    allowed_mentions: { users: winner ? [winner.id] : [] },
    embeds: [{
      color: 0xd8ad68,
      title: "🏆 VÍTĚZ MECHATURNAJE",
      description: winner ? `Gratulujeme <@${winner.id}>! S celkovým počtem **${winner.score} bodů** vítězíš a získáváš **Mafia: Domovina**.` : "Turnaj byl ukončen.",
      fields: [
        { name: "🥇 1. místo", value: winner ? `${winner.nickname} — ${winner.score} bodů` : "—" },
        { name: "🥈 2. místo", value: second ? `${second.nickname} — ${second.score} bodů` : "—", inline: true },
        { name: "🥉 3. místo", value: third ? `${third.nickname} — ${third.score} bodů` : "—", inline: true },
        { name: "Discord vítěze", value: winner ? `<@${winner.id}> • ID: \`${winner.id}\`` : "—" },
        { name: "Steam vítěze", value: winnerDetails?.steamProfile ? `[Otevřít Steam profil](${winnerDetails.steamProfile})` : "Neuveden" },
        { name: "Bodový přehled vítěze", value: winnerBreakdown },
        { name: "Předání výhry", value: "Výhra bude do 24 hodin připsána na Steam účet vítěze." }
      ],
      footer: { text: "MechaTurnaj • Kompletní výsledky jsou uložené na webu" },
      timestamp: now()
    }]
  });
};

const adminAction = async (req, res) => {
  const admin = await requireOrganizer(req);
  const action = cleanString(req.body?.type, 40);
  let state = await getState();
  let detail = "";

  if (action === "open_lobby") {
    if (!["not_started", "published", "cancelled"].includes(state.status)) throw Object.assign(new Error("Turnaj už byl otevřen."), { status: 409 });
    const players = await initializePlayers();
    state = defaultState(); state.runId = crypto.randomUUID(); state.status = "lobby"; state.phase = "lobby"; state.players = players;
    detail = `${players.length} hráčů`;
  } else if (action === "start_game") {
    if (state.status !== "lobby") throw Object.assign(new Error("Nejdřív otevři čekárnu."), { status: 409 });
    if (!state.readyIds?.length) throw Object.assign(new Error("V čekárně není žádný připravený hráč."), { status: 409 });
    state.players = state.players.filter((player) => state.readyIds.includes(player.id));
    state.status = "running"; setupRound(state, 1); detail = `${state.players.length} připravených hráčů`;
  } else if (action === "begin_hunters") {
    if (state.phase !== "round_intro") throw Object.assign(new Error("Kolo není připravené ke startu."), { status: 409 });
    state.phase = "hunter_turns";
  } else if (action === "complete_hunter") {
    detail = completeHunter(state, req.body);
  } else if (action === "set_scores") {
    await applyScoring(state, req.body); detail = "Bodování a vyřazení uloženo";
  } else if (action === "publish_round") {
    if (!["voting", "ready_to_publish"].includes(state.phase)) throw Object.assign(new Error("Výsledky zatím nelze vyhlásit."), { status: 409 });
    await finalizeRoundTotals(state); detail = `Vyhlášeno ${state.currentRound}. kolo`;
  } else if (action === "next_round") {
    if (state.phase !== "round_results") throw Object.assign(new Error("Nejdřív vyhlas výsledky kola."), { status: 409 });
    if (state.currentRound >= 5) { state.phase = "tournament_end"; state.status = "finished"; }
    else setupRound(state, state.currentRound + 1);
  } else if (action === "publish_winners") {
    if (state.phase !== "tournament_end") throw Object.assign(new Error("Turnaj ještě není připravený k vyhlášení."), { status: 409 });
    await announceWinners(state); detail = "Vyhlášen vítěz";
  } else if (action === "cancel_tournament") {
    if (!["lobby", "running", "finished"].includes(state.status)) throw Object.assign(new Error("Tento turnaj už nelze předčasně ukončit."), { status: 409 });
    state.status = "cancelled";
    state.phase = "cancelled";
    detail = cleanString(req.body?.reason, 300) || "Turnaj byl ukončen pořadatelem";
    state.cancelReason = detail;
  } else if (action === "reset_tournament") {
    if (!["cancelled", "finished", "published"].includes(state.status)) throw Object.assign(new Error("Reset je dostupný po ukončení nebo vyhlášení turnaje."), { status: 409 });
    const previousAudit = state.auditLog || [];
    state = defaultState();
    state.auditLog = previousAudit;
    detail = "Turnaj vrácen do výchozího stavu";
  } else {
    throw Object.assign(new Error("Neznámá administrační akce."), { status: 400 });
  }

  addAudit(state, admin, action, detail);
  await saveState(state);
  return res.status(200).json({ tournament: publicState(state), detail });
};

const getAdminState = async (req, res) => {
  await requireOrganizer(req);
  const state = await getState();
  const voteIds = state.phase === "voting" ? await loadVoteIds(state.currentRound, state.runId) : [];
  return res.status(200).json({ tournament: publicState({ ...state, viewerVoteIds: voteIds }), raw: state, voteIds });
};

const handleTournamentRequest = async (req, res, action) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    if (action === "tournament-state" && req.method === "GET") return getPublicState(req, res);
    if (action === "tournament-join" && req.method === "POST") return joinLobby(req, res);
    if (action === "tournament-vote" && req.method === "POST") return submitVote(req, res);
    if (action === "tournament-admin-state" && req.method === "GET") return getAdminState(req, res);
    if (action === "tournament-admin-action" && req.method === "POST") return adminAction(req, res);
    return res.status(404).json({ error: "Not found" });
  } catch (error) {
    console.error("Tournament API failed", error);
    return res.status(error.status || 500).json({ error: error.status ? error.message : "Turnajový požadavek se nepodařilo dokončit." });
  }
};

module.exports = { handleTournamentRequest };
