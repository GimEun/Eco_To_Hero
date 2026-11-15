export const ROSTER_RULES = Object.freeze({ starters: 5, maximum: 8 });

export const aiRosterMaximum = club => club.leagueId === 'world' ? ROSTER_RULES.maximum : ROSTER_RULES.starters;
