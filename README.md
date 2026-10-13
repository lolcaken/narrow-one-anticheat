# narrow-one anticheat notes

client + wire level anticheat in narrow.one, reconstructed from the decompiled
client bundle (`js/index-*.js`, three.js r128 era). snippets are verbatim excerpts,
trimmed to the check itself. no bypass code lives here.

## how it works

detection runs on every client, against every other player:

- your client simulates each remote player locally and scores their movement
- scores go to the server as opcode `21` reports: `[21, playerId, code, value]`
- server kicks with opcode `13`: reason `5`, `extra[0]` = the report code
- observers relay your position stream at ~20hz (opcode `4` batches), so they
  all score the same bytes you send (opcode `2`)

report codes: `1` fly, `2` health anomaly, `3` invalid arrows, `4` arrow rate,
`5` dead-player actions.

## the fly check (code 1)

two accumulators, both reset on any floor touch (`inAirTime < 200`):

- up-travel: each airborne frame adds your motion weighted by how upward it
  points (up x1, horizontal x0.5, falling x0). score ramps 0->1 over 17->30.
  fires before 5s airborne on any real flight.
- air-time: starts after 5000ms continuous airborne, then raycasts down every
  1s. ground <2m -> weight 0, 2-5m -> partial, >5m or no hit -> weight 10,
  score 0->1 over 10000 weighted-ms.

`report(Je=1, max(t, e))` fires whenever either score is above zero. report
values <= 0 are dropped, reports are throttled to 1/sec per player, 15s spawn
grace, offline games throw instead of reporting.

observed live: t goes non-zero ~4s into flight, e pegs 1.0 ~1s after the 5s
mark at altitude, both stay pegged, then `disconnect: reason=5 extra=[1]`.

## other checks

- invalid arrows: victim tests the arrow segment vs its own collider, 3 bad
  hits in 3s -> code 3
- arrow rate: `verifyArrowFrequency` per bow, too fast -> code 4
- dead actions: shooting or flag ops while dead -> code 5
- health: negative-health resets twice in a row -> code 2
- menu scan: dom check for 6 known cheat menus every 15s for 90s -> local
  rickroll dialog only, nothing is sent to the server
- opcode 55: server can push js for the client to run and return the result
  (hotfix channel)

## server side (inferred from client + wire)

- receives your position stream (opcode 2, uint16 quantized over map bounds,
  20hz) and knows your class stats, so speed / jump validation is possible
- force-snaps your position via opcode 4 with the snap flag (`o[2]==1`) when
  it disagrees with your stream
- no client code exists for noclip / wall checks, so those would be server
  side if they exist at all

## files

everything lives in `narrow-one-anticheat.js`: header comment up top, then
one `// --- section ---` per check, in this order:

antifly accumulate, antifly report, report codes, report throttle,
report gate, report wire, q helper, invalid arrow, arrow frequency,
dead action, health anomaly, fly flag, disconnect, server pos,
force snap, menu scan, server exec.

excerpts are verbatim trimmed decompiler output (method bodies without the
surrounding class), so the file reads as notes, not runnable code.

source: narrow.one client bundle, decompiled for research. variable names are
minified originals, comments above each snippet describe the behavior.
