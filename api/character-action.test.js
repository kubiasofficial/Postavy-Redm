const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCharacterActionPayload } = require('./character-action');

test('buildCharacterActionPayload creates a wake embed with title and message', () => {
  const payload = buildCharacterActionPayload({
    type: 'wake',
    profile: {
      displayName: 'Zeke',
      wakeTitle: 'Zeke je vzhůru',
      sleepTitle: 'Zeke usnul',
      color: 9803822,
      footer: 'West Haven'
    },
    message: 'Testovací probuzení',
    reportText: '',
    durationText: '',
    sleepLocation: null
  });

  assert.equal(payload.username, 'West Haven');
  assert.equal(payload.embeds[0].title, 'Zeke je vzhůru');
  assert.match(payload.embeds[0].description, /Testovací probuzení/);
});
