// Balance config: spec defaults (PROJECT_SPEC.md). All editable; real build reads from server admin config.
export const CONFIG = {
  pricePerThSats: 25000,       // mock "current price per TH" (set daily by hand in real build)
  pricePerThUsd: 18.5,
  thCap: 1000,
  split: { player: 80, project: 15, owner: 5 },
  adShare: 90, adGrantHours: 24,
  mockAdRevenueSats: 12,       // mock settled revenue per ad view (real: ad network, OPEN)
  failTargetPct: 5, failAttackerCapPct: 25, failDefenderDiv: 5,
  stealPct: 10,
  robsPerDefenderPerDay: 1,
  withdrawCutoffSats: 100000,
  lnFeePermille: 4, lnFeeBase: 4,
  thawHours: [24, 36, 48, 60, 72], // L1..L5
  weeklySplit: [50, 20, 10, 10, 10],
  mockDailyNetPayoutPerThSats: 60, // mock GoMining net payout per TH per day (no API)
  timer: { seconds: 20, floor: 5, firewallDelta: -3, firewallMax: -15, missingAnti: 3 },
};
