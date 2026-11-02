// Training plans: a 7-day cycle of days, each a list of slots ("a stance hold, 3 sets").
// The slots are filled from the holds you have open (see planToday in progress.js), so a
// plan works whatever you've unlocked and grows as you unlock more.
//
// A slot is { group, sets }: `group` is a home screen section (HOLD_GROUPS' keys) and
// `sets` how many times to do the hold. Hard days (legs, upper body, core) alternate with
// easy ones, and a hold done one day is avoided the next, so muscles get a day to recover.
// The cycle moves on a day when you train, so a missed day doesn't skip anything.
//
// Plans are structure only: they don't earn or cost coins.

const day = (name, ...slots) => ({ name, slots: slots.map(([group, sets = 1]) => ({ group, sets })) });

export const PLANS = [
  {
    key: 'foundation', name: 'Foundation plan', from: 'white',
    about: 'About 3 holds a day, with two easy days a week. Short sessions, done regularly, are what build tendons.',
    days: [
      day('Legs', ['stances', 2], ['core'], ['qigong']),
      day('Arms & upper body', ['upper', 2], ['still']),
      day('Easy day', ['still'], ['qigong']),
      day('Legs', ['stances', 2], ['upper']),
      day('Core', ['core', 2], ['qigong']),
      day('All round', ['stances'], ['upper'], ['core']),
      day('Easy day', ['still'], ['qigong']),
    ],
  },
  {
    key: 'steady', name: 'Steady plan', from: 'green',
    about: 'About 5 holds a day, with repeat sets on the main hold of each hard day, and two easy days a week.',
    days: [
      day('Legs', ['stances', 3], ['stances'], ['core'], ['qigong']),
      day('Arms & upper body', ['upper', 2], ['upper'], ['core'], ['still']),
      day('Easy day', ['still'], ['qigong'], ['qigong']),
      day('Legs', ['stances', 3], ['stances'], ['upper']),
      day('Core', ['core', 2], ['core'], ['qigong'], ['still']),
      day('All round', ['stances', 2], ['upper'], ['core'], ['qigong']),
      day('Easy day', ['still'], ['qigong']),
    ],
  },
  {
    key: 'deep', name: 'Deep plan', from: 'brown',
    about: 'About 7 holds a day: three sets of the main hold on hard days, a second hold of the same kind, and easy days to recover.',
    days: [
      day('Legs', ['stances', 3], ['stances', 2], ['core'], ['qigong']),
      day('Arms & upper body', ['upper', 3], ['upper', 2], ['core'], ['still']),
      day('Easy day', ['still'], ['qigong'], ['qigong']),
      day('Legs', ['stances', 3], ['stances', 2], ['upper'], ['qigong']),
      day('Core', ['core', 3], ['core', 2], ['qigong'], ['still']),
      day('All round', ['stances', 2], ['upper', 2], ['core', 2], ['qigong']),
      day('Easy day', ['still'], ['qigong'], ['still']),
    ],
  },
];

// When a section has none of your holds left for a slot, the slot takes one from these instead.
export const FALLBACK = {
  stances: ['core', 'qigong'],
  upper: ['core', 'qigong'],
  core: ['upper', 'stances'],
  qigong: ['still', 'upper'],
  still: ['qigong', 'core'],
};
