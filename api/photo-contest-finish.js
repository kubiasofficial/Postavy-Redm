const {
  fetchFirestoreCollection,
  fetchFirestoreDocument,
  patchFirestoreDocument,
  sendDiscordMessage
} = require("./_west-haven");

const WINNER_CHANNEL_ID = "1505429461267386449";

const getPragueDayInfo = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayIndex = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[values.weekday] || 1;

  return {
    weekdayIndex,
    utcNoon: new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 12))
  };
};

const shiftDateKey = (utcNoonDate, offsetDays) => {
  const shifted = new Date(utcNoonDate.getTime() + (offsetDays * 24 * 60 * 60 * 1000));
  return shifted.toISOString().slice(0, 10);
};

const getCurrentWeekId = () => {
  const dayInfo = getPragueDayInfo();
  return shiftDateKey(dayInfo.utcNoon, 1 - dayInfo.weekdayIndex);
};

const getRequestBody = (req) => {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      return {};
    }
  }
  return req.body;
};

const formatVotes = (count) => {
  if (count === 1) return "1 hlas";
  if (count > 1 && count < 5) return `${count} hlasy`;
  return `${count} hlasů`;
};

const buildLeaderboard = (contest, votes) => {
  const counts = votes.reduce((accumulator, vote) => {
    accumulator[vote.photoId] = (accumulator[vote.photoId] || 0) + 1;
    return accumulator;
  }, {});

  return (Array.isArray(contest.photos) ? contest.photos : [])
    .map((photo, index) => ({
      ...photo,
      originalIndex: index,
      votes: counts[photo.id] || 0
    }))
    .sort((first, second) => (
      second.votes - first.votes || first.originalIndex - second.originalIndex
    ));
};

const buildWinnerMessage = (contest, leaderboard) => {
  const topPhotos = leaderboard.slice(0, 3);
  const winner = topPhotos[0];

  return {
    content: "Vyhlášení týdenní foto soutěže West Havenu je tady.",
    embeds: [
      {
        title: `Foto soutěž: ${contest.startsAt || contest.weekId} až ${contest.endsAt || "neděle"}`,
        description: topPhotos.length
          ? "Díky všem za hlasy. V pondělí začíná nové hlasování z posledních šesti fotek."
          : "Tento týden nebyly v soutěži žádné fotky.",
        color: 0xa97839,
        image: winner?.url || winner?.proxyUrl ? { url: winner.proxyUrl || winner.url } : undefined,
        fields: topPhotos.map((photo, index) => ({
          name: `${index + 1}. místo`,
          value: [
            photo.caption || "Fotka bez popisku.",
            photo.authorName ? `Autor: ${photo.authorName}` : "Autor neznámý",
            formatVotes(photo.votes)
          ].join("\n"),
          inline: false
        })),
        footer: {
          text: "West Haven Gallery"
        },
        timestamp: new Date().toISOString()
      }
    ]
  };
};

module.exports = async (req, res) => {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "Missing DISCORD_BOT_TOKEN" });
  }

  const body = getRequestBody(req);
  const weekId = String(body.weekId || req.query.weekId || getCurrentWeekId());
  const force = Boolean(body.force || req.query.force === "1");

  try {
    const contest = await fetchFirestoreDocument(`photoContests/${weekId}`);
    if (!contest) {
      return res.status(404).json({ error: "Photo contest not found", weekId });
    }

    if (contest.winnerPostedAt && !force) {
      return res.status(200).json({ skipped: true, reason: "Winners already posted", weekId });
    }

    const voteDocuments = await fetchFirestoreCollection("photoContestVotes");
    const votes = voteDocuments
      .map((document) => document.data)
      .filter((vote) => vote.weekId === weekId);
    const leaderboard = buildLeaderboard(contest, votes);
    const payload = buildWinnerMessage({ ...contest, weekId }, leaderboard);

    await sendDiscordMessage(token, WINNER_CHANNEL_ID, payload);
    await patchFirestoreDocument(`photoContests/${weekId}`, {
      status: "finished",
      winnerPostedAt: Date.now(),
      winnerChannelId: WINNER_CHANNEL_ID
    });

    return res.status(200).json({
      ok: true,
      weekId,
      winners: leaderboard.slice(0, 3).map((photo, index) => ({
        place: index + 1,
        id: photo.id,
        votes: photo.votes,
        authorName: photo.authorName || null
      }))
    });
  } catch (error) {
    return res.status(500).json({
      error: "Unable to finish photo contest",
      details: error.message
    });
  }
};
