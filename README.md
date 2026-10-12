# BTC Hack Miner — web prototype
Static, no build step. `npm test` runs the rule tests (RULES.md). `npm run serve` serves at :8080.
- `src/config.js` balance config (spec defaults + mock values)
- `src/rules.js` pure ledger/hack rules (port to server later)
- `src/sim.js` local mock server: state, ledger, bots, clock, settlement, weekly pool
- `src/minigames.js` five v1 puzzles (report pass/time/wrong only)
- `src/main.js` UI
All money is simulated. No GoMining, Lightning, ads, payments or accounts.
