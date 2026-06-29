const DISCORD_API_BASE = 'https://discord.com/api/v10';
const CHARACTER_ACTION_CHANNEL_ID = '1507668908109332560';

const sanitizeReportText = (text) => (
  (text || 'Bez zápisu.').replaceAll('```', "'''" ).slice(0, 900)
);

const formatMapLocation = (sleepLocation) => {
  if (!sleepLocation || typeof sleepLocation !== 'object') return 'nezadáno';
  return sleepLocation.name || 'nezadáno';
};

const buildCharacterActionPayload = ({ type, profile, message, reportText, durationText, sleepLocation }) => {
  const embed = type === 'wake'
    ? {
        title: profile.wakeTitle,
        description: `> ${message}`,
        color: profile.color,
        author: { name: 'West Haven Morning Notice' },
        footer: { text: `${profile.footer} • timer spuštěn` },
        timestamp: new Date().toISOString()
      }
    : {
        title: `Night Report • ${profile.displayName}`,
        description: [
          `> ${message}`,
          '',
          '**Night report podklad**',
          '```',
          sanitizeReportText(reportText),
          '```',
          `**Dnes ${profile.breathingVerb}:** \`${durationText}\``,
          `**Místo spánku:** \`${formatMapLocation(sleepLocation)}\``
        ].join('\n'),
        color: profile.color,
        author: { name: 'West Haven Night Office' },
        footer: { text: `${profile.footer} • report uzavřen` },
        timestamp: new Date().toISOString()
      };

  return {
    username: 'West Haven',
    embeds: [embed]
  };
};

const sendCharacterActionToDiscord = async ({ type, profile, message, reportText, durationText, sleepLocation }) => {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error('Missing DISCORD_BOT_TOKEN');
  }

  const payload = buildCharacterActionPayload({
    type,
    profile,
    message,
    reportText,
    durationText,
    sleepLocation
  });

  const response = await fetch(`${DISCORD_API_BASE}/channels/${CHARACTER_ACTION_CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Discord API request failed: ${details}`);
  }

  return true;
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch (error) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  const type = String(body?.type || 'wake');
  const profile = body?.profile || {};
  const message = String(body?.message || '').trim();
  const reportText = String(body?.reportText || '');
  const durationText = String(body?.durationText || '');
  const sleepLocation = body?.sleepLocation || null;

  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  try {
    await sendCharacterActionToDiscord({
      type,
      profile,
      message,
      reportText,
      durationText,
      sleepLocation
    });
    return res.status(200).json({ sent: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unable to send Discord message' });
  }
};

module.exports.buildCharacterActionPayload = buildCharacterActionPayload;
