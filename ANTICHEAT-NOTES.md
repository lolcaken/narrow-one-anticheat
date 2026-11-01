# Narrow One — anti-cheat notes and bypass design

Sources: the decompiled client at `TapeV1/narrow.one/decompiled/js/index-BSfqhLBb/entry.js.js`, the notes at `TapeV1/narrow-one-anticheat/`, and the live bundle loaded by `narrow.one` at test time (`/js/index-CGd_1Yik.js`). The live bundle is newer than the decompile; every reference below was re-checked against the runtime dumper output where it mattered.

## 1. Detection loop

Every client simulates every other player locally and scores their movement. There is no dedicated server-side anti-cheat process visible in the client; the observers are the players.

```
observer tick:
  simulate remote player from op2/op4 stream
  update up-travel and air-time accumulators
  if score > 0: send op21 [21, playerId, code, value]
server:
  collect reports, kick with op13 reason=5, extra[0]=code
```

Report codes from the notes:

| code | meaning |
|---:|---|
| 1 | fly / vertical movement |
| 2 | health manipulation |
| 3 | bad arrow (validation failed) |
| 4 | fire rate |
| 5 | action while dead |

Opcode 21 is a client-to-server report. Its wire layout is `u32 op, u32 playerId, u32 code, u32 value`; the value is the max of the two fly accumulators for code 1.

Kick packet op13: `u32 op, u32 reason, u32 extra*`. Reason `5` is the anti-cheat kick; `extra[0]` carries the code. The menu logs this and can bail on it.

## 2. Position stream

Client-to-server opcode 2, 16 bytes, sent at ~20 Hz:

```
u32 op          = 2
u16 playerId
u16 x           quantized against map bounds
u16 y
u16 z
u16 yaw8        yaw / 2π * 65535
u16 pitch8      pitch normalized
```

Server-to-client opcode 4 relays the same player records to observers:

```
u32 op          = 4
u16 flags       bit 1 = server snap
(u16 id, x, y, z, yaw8, pitch8) * n
```

The client's own `sendPlayerData` sends at most every 50 ms and repeats a position up to 3 times when nothing changed. The governor keeps its own 46 ms floor and resends the last legal position inside that window.

Quantization uses the map bounds delivered by opcode 19 (`f32 minX,minY,minZ,maxX,maxY,maxZ`) or discovered from the game object. Out-of-range values clamp; the client's own `q()` helper uses normalized floats, so the dumper reports both the raw `u16` and the reconstructed position.

## 3. Anti-fly math

The observer keeps two accumulators, both reset when the simulated player touches the floor.

### Up-travel

Airborne motion is weighted by upwardness:

- moving up: weight 1.0
- moving sideways: weight 0.5
- falling: weight 0

The accumulator is normalized with `q(17, 30, 0, 1, acc)` — 0 at 17 units of weighted up-travel, 1 at 30. A real flight crosses the first threshold in roughly 4 seconds. The report fires as soon as the score is non-zero.

### Air-time

Starts only after 5000 ms continuously airborne. Once started, the observer raycasts down once per second:

| ground distance | weight |
|---|---|
| < 2 m | 0 |
| 2–5 m | partial (linear) |
| > 5 m or no hit | 10 |

The accumulator is normalized with `q(0, 10000, 0, 1, airAcc)` and reported once it exceeds 0. Observed live: up-travel goes non-zero around 4 s of flight, air-time pegs about 1 s after the 5 s mark, then the server kicks with `reason=5 extra=[1]`.

There is a 15-second spawn grace. Reports are throttled to about one per second per observer. Zero-valued reports are dropped.

### What this means

- **Any** sustained visible flight is detectable: every observer runs this block, and the report path is client-to-server.
- Flying below the thresholds for less than ~4 s is safe against this specific check.
- Hovering more than 5 m above ground for more than 5 s is the worst case: the air-time weight is 10 and the score saturates quickly.
- Staying within 2 m of ground and keeping the up-travel weight low keeps both accumulators at zero.

## 4. Other checks

- **Arrows (code 3):** the victim intersects the arrow segment with its collider. Three bad arrows in three seconds reports. Silent aim solves the bow's real parabola (`Di.getParabolaPoint2d`) from the op3 camera position, for the actual `fireAmount01`, with ping + prediction lead. It only rewrites when the solved arc misses by less than 0.7 m, the turn from the original direction is under `Max turn` (default 90°), and visibility passes. Every solvable arrow is rewritten — rewriting changes the direction bytes, not the packet count, so it cannot raise the arrow-frequency counter. The solver walks the configured hitbox first, then head/body/feet, so a steep head arc falls back instead of skipping. Rewrites, failures and the last 12 outcomes (`Silent trace`) are shown in the Combat tab.
- **Straight shot:** enables the game's own `autoShoot` setting so the bow holds to `fireAmount01 = 1` before release. Higher draw strength is the flattest trajectory the bow can produce; this is not a trajectory change, it is the weapon's own full-draw path.
- **Fire rate (code 4):** too-fast fire reports. The triggerbot uses a 2-second shot window and a configurable budget (`silentRate`, default 0.0034 arrows/ms = 6.8 arrows / 2 s). Silent rewriting itself is not gated: it emits no extra arrows.
- **Dead actions (code 5):** firing while dead. All features check `S.me.dead` / `S.ready`.
- **Health (code 2):** two health resets report. Nothing in the menu writes health.
- **Menu scan:** the client looks for six known menu DOM signatures and shows a local dialog. It does not send a report. The Chimera menu uses a shadow root and `n1-` IDs, so it does not match those signatures.
- **Opcode 55:** server-pushed JavaScript. The socket hook drops it when `Block op55 server JS` is enabled. This is the only server-to-client code execution path in the protocol.

## 5. Governor

`src/anticheat/governor.js` sits on the outbound WebSocket send path and rewrites opcode 2 before it leaves the page.

| mode | behavior |
|---|---|
| `auto` | follows the fly mode: ghost → ghost, hop or raw → raw, otherwise sanitize |
| `sanitize` | clamps the outbound position to the last position the twin accepted; keeps yaw/pitch |
| `ghost` | replaces position with the synthetic grounded patrol from `Ghost.tick()` |
| `hop` | same raw pass-through; the movement layer owns the up/down cycle and ground reset |
| `strict` | sanitize + tighter clamps + no vertical delta |
| `off` | no rewrite; raw stream (detected) |

Every rewrite keeps the original `playerId`, yaw, and pitch. The governor also:

- enforces a 46 ms minimum between sends; inside the window it resends the last legal position rather than dropping the packet;
- resets on game attach, teleport, bail, and mode change;
- counts `out`, `held`, `clamped`, `resends`, and `snaps` for the Anti-Cheat tab.

### Twin

`src/anticheat/twin.js` is a local copy of the observer's anti-fly block. It is fed the same position, dt, grounded flag, ladder flag, and air-friction modifier the observer would use, and computes:

- `t` — up-travel score
- `e` — air-time score
- `airRaw` — raw milliseconds airborne
- `lastRayDist` — last ground ray distance
- `crossMax` — maximum x/z mismatch between twin and local position
- `verdict` — `clean`, `climbing`, `air`, `detected`

The twin is not the server. It is the best available model of what the other clients will compute.

### Ghost

`Ghost.tick(dt)` produces a legal grounded patrol:

1. Anchor at the local player's position projected down to the ground (raycast 200 units down).
2. If no ray hit, fall back to the spawn position; if there is no spawn either, refuse ghost and log it.
3. Walk a small patrol around the anchor with a speed cap, clamped inside the map bounds.
4. Never leave the floor; the anchor is re-projected when the local player moves more than a few units.

The wire shows a player walking on the ground. The local camera flies. Other clients render the ghost at the wire position; the local client renders the real player because the camera is local. This is the only mode that keeps sustained flight out of the observer's input entirely.

### Hop

Hop mode passes the real position and cycles through a visible takeoff, flight, landing, and ground pause. The movement layer owns the cycle:

1. `up`: local fly enabled, real op2 stream. Ends when altitude exceeds `Hop ceiling`, air time exceeds `Hop air time`, or the twin reaches `t > 0.02`, `e > 0.02`, up-travel > 12.5, air-time > 4000 ms.
2. `down`: local fly off, gravity lands the player. Observers see the descent.
3. `wait`: while `isOnFloor` (or `onFloorTime > 60 ms`), holds for `Ground pause` (default 500 ms), which is longer than the observer's 200 ms `inAirTime` reset window. Then it takes off again automatically.
4. If a landing takes more than 4.5 s, raycasts down and snaps to the floor as a fallback.

The up-travel accumulator needs roughly 17 m to reach 1.0 and the air-time raycast starts at 5000 ms; the cycle trips well before either, and the ground pause zeroes both. The result is visible flight in bursts with no report line. It does not disable `CFG.fly`; the cycle repeats until the user turns fly off.

## 6. Bail

`src/anticheat/bail.js` watches for:

- the kick dialog text `Cheats detected` / `Final warning` in the page body (900 ms poll);
- op13 disconnect with reason 5 or 10;
- three server snaps of more than 5 units within 10 seconds.

On trip it disables aimbot, silent aim, fly, rapid fire, triggerbot, noclip; clears held inputs; grounds the player; resets the governor and twin; writes a cooldown to `localStorage` (default 5 minutes); and sets the status to `bailed`. While the cooldown is active, `bailed()` makes every feature a no-op and forces the governor into `sanitize`.

Snaps are detected from opcode 4 records with the snap flag set, matched to `S.myId`, and compared against the local position. The distance is logged.

## 7. Local report patch

`Game.syncPatches()` replaces `game.antiCheat.reportPlayer` with a no-op when `Neuter local reports` is on. It stores the original on `game.__n1ReportOrig` and restores it when the toggle is off. This is a local patch only; it cannot stop another client from reporting you.

## 8. Evidence from the live run

Tested 2026-10-31 against the live bundle, Chrome via Playwright, v5.2.0, CTF/FFA matches:

| check | result |
|---|---|
| capture | `game adopted score=6`, `match · 5 foes` |
| ESP | boxes, names, distance, tracers, flag markers rendered; head projection 0.18 px from screen center at 150 m |
| aimbot | instant aim error 0.000° yaw / 0.000° pitch at 150 m |
| ghost fly | governor `ghost`, twin score `0.000`, up-travel `0.000`, air-time `0.000`, verdict `clean` |
| silent aim | 60 m rewrite, solved arc miss 0.00 m, 11.7° turn; 6-arrow burst = 6 op3 rewritten + 6 local arrow fixes; health drop observed on a live 1 m rewrite |
| rapid burst | 6 arrows / burst, `verifyArrowFrequency` probe returns true through 7/2000 and false at 8/2000 on medium bow; shared budget window holds |
| hop fly | 3 visible up/down cycles in 4 s, governor `raw`, twin `0.000` through every cycle, fly stays enabled |
| op55 | counters incremented (`1408`, `3688` in the log) with block enabled |
| report patch | log `[ac] local report path neutered` |
| kick | live kick `reason=5 extra=[4]` after a session mixing rapid bursts, ragebot taps and insta-shoot clicks; budget simulation reproduces 243 observer reports without the gate and 0 with it (30 s ±60 ms jitter, 60 s ±120 ms) |
| ad block | no `#pokiSDKAdContainer`, no CMP container, `PokiSDK` stub object present |
| auto-join | joined a match with no trusted gesture, body read `gamemode: capture the flag` |
| dumper | full JSON downloaded, player class `Ii`, 237 player slots, 30 observed opcodes |
| menu | 8 tabs, shadow DOM, no console errors other than the page's own `Provider's accounts list is empty` |

## 9. op55 — server-pushed JavaScript

op55 is a server to client message. The payload is JSON `{ id, c }`, where `c` is a string of JavaScript. The client decodes it, then runs:

```js
const i = await new Function("main", '"use strict";' + e.c)(po());
```

`po()` is the game's main application object. The result is sent back on op32 as `{ id, r }`, or `{ id, e }` if the script throws. In plain terms: the server can execute arbitrary JavaScript inside the page with full access to the game object, and receive a value in return.

What it is used for: server-driven live config, remote feature flags, experiments, and checks that the developers want to change without shipping a new bundle. Nothing in the client limits what the string can do.

What the cheat does: `Block op55 server JS` drops the frame at the socket before the client evaluates it. The Anti-Cheat tab counts `op55 seen` and `op55 blocked`. Blocking is the safe default; if a match stops advancing after an update, toggle it off and retest. A malicious or compromised server could use op55 to read the page, change game state, or fingerprint the client — the block is the only place that is stopped.

## 10. Weapon mods and ragebot — detection surface

These are local client behaviours, so the observer anti-cheat never sees them directly. What the server does see is the arrow stream.

| mod | what it changes | server-visible |
|---|---|---|
| no recoil | `crosshair.currentAccuracy` forced to 0; weapon `getAccuracyOffset`/`getWalkAccuracyMultiplier` return 0/1 | no — spread is applied client-side before the op3 direction is written |
| draw speed | `getLoadSpeed` fill call only (args ≤ 0.005/ms) multiplied | no — draw is local animation and input state |
| insta-shoot | fill rate 200/ms, `fireAmount01 = 1` on pull, manual release cooldown false, `shootMultiple(…, 1)` | only through arrow frequency, same as any fast release |
| melee speed | `getAttackSpeedStat` returns 1 | attack rate is locally simulated; `meleeSpammer` is a local flag based on player/attack timestamps |
| ragebot | full-draw `shootArrow(1)` burst on target | arrow frequency; every arrow is a normal op3 with a solved direction |
| third person | menu dispatches the game's own `KeyY`; mode read from the render camera offset | vanilla feature — normal camera state, no extra packets |
| flag speed | `me.flagWalkSpeed` synced to `me.walkSpeed` (stock 45 vs 60) | no — movement integration is local; op2 deltas already fit the governor's speed budget |
| godmode | `setHealthFromHit` clamped to 1, `forceSetHealthFromServer` ignored, `die` no-op | hits still report on op22 with full health; server may track op7 damage separately |
| spinbot | outbound `op2` yaw rotated, `me.lookRot` untouched | yaw is free client state; observers see the model spin |
| snap guard | `setServerData` force flag dropped for the owned player | none — the inbound op4 stream is unchanged; only the local teleport is skipped |
| arrow budget | one send gate shared by rapid, rage, clicks and multi-arrow releases | send-side only: arrows above the weapon's window are never put on the wire |

Two hard limits:

- **Damage is not local, and it is capped at 0.9 per second.** `markValidArrowHit` runs on the victim, reads `arrow.damageMultiplier` (`arrowWeaponOpts.damageMultiplier × playerDamageMultiplier 0.8–1.2`) from that client's copy of the shooter's weapon, then `applyDamage` calls `getDamageAmountForCurrentArmor`:

```js
// drop history older than 1000 ms
for (let i = history.length - 1; i >= 0; i--)
    if (!(now - history[i].time > 1000)) break;
    else history.splice(i, 1);

damage = t * armorMultiplier;              // 0.7–1.1 by armorStrength
damage = computeDamageWithCooldown(damage); // min(t, 0.9 - sum(history))
```

So a single arrow can never remove more than `0.9` health, and once `0.9` has landed inside the last second every further arrow computes `0` damage. Two hits roughly one second apart kill a full-health player; a 3-arrow burst on one target is one damaging arrow, two dead packets and three slots of the frequency budget.

The cap is per victim, which is the only place the ragebot can win: **six victims can each take 0.9 in the same frame.** The bot therefore fires a volley — one arrow on every eligible enemy in the same tick — and comes back after the per-target gap to finish them all. A target already at or below `0.9` health dies on the first arrow of the volley, so low-health targets are sorted to the front.
- **Rate is the only real gate.** Every arrow goes through one `ArrowBudget` gate: rapid bursts, ragebot volleys, manual clicks, insta-shoot releases, triggerbot and `shootMultiple` all charge the same 2.4 s counter. The cap is the weapon's own `verifyArrowFrequency` probe minus the observer's permanently stale timestamp (6 on the medium bow, 4 on the large bow). `rageReserve` keeps two slots for the bot, so a held LMB cannot starve it. Volleys repeat per target after `rageGapMs` (1050 ms), just past the victim's 1 s damage history.

### Why code 4 fires

`createServerArrow` runs on every client for every arrow received:

```js
player.serverArrowCreated();                                  // push now, then trim
if (!player.bowWeapon) player.report(4, 1);                  // arrow from no weapon
else if (!bow.verifyArrowFrequency(player.avgArrowCreationFrequency))
    player.report(4, 3);                                     // too fast
```

`recentArrowCreationTimes` and the trim:

```js
serverArrowCreated() {
    this.recentArrowCreationTimes.push(performance.now());
    let t = 0;
    for (let e = 0; e < this.recentArrowCreationTimes.length; e++) {
        if (!(performance.now() - this.recentArrowCreationTimes[e] > 2000)) break;
        t = e;                                                // last stale index
    }
    this.recentArrowCreationTimes.splice(0, t);               // keeps one stale entry
}
```

`splice(0, t)` should be `splice(0, t + 1)`. One timestamp older than 2 s survives forever, so the checked value is `count / 2000` on `fresh + 1`. Medium bow threshold 0.004 accepts up to 7 counted arrows, hence 6 real ones; large bow 0.003 accepts 5, hence 4. The budget adds 400 ms of window margin so relay jitter cannot compress our spacing inside the observer's 2 s.

The two other code-4 shapes are covered at the same gate: an arrow from a weapon that is no longer `me.bowWeapon` is dropped (observers would see `bowWeapon == null` during a switch), and an arrow while `me.dead` is dropped before it reaches the send path.

### Why code 3 fires

Code 3 is the hit claim, not the arrow stream. The victim validates every claim the shooter sends:

```js
playerClaimedHitByArrow(shooter, arrowId, colliderIndex) {
    const collider = this.rigidBody.colliders[colliderIndex];
    const arrow    = this.game.arrowManager.getArrowById(shooter.id, arrowId);
    if (!arrow) return;                                    // dropped, no report

    if (arrow.consumed)                    return shooter.report(3, 1);  // A
    if (!differentTeams(shooter, this))    return shooter.report(3, 1);  // B

    // closest approach of arrow.travelledPositions to collider.center
    if (distance < 3) markValidArrowHit(...);              // accepted
    else {
        arrow.onTravel(checkAgain);                        // waits for it
        setTimeout(() => {
            if (!accepted) invalidArrowTimes.push(now);    // C
            if (invalidArrowTimes in last 3 s >= 3) shooter.report(3, 1);
        }, 1000);
    }
}
```

Three ways to earn a strike:

- **A — duplicate claim on one arrow.** The client's own player raycast loop is not guarded by `didHitPlayer`:

  ```js
  for (const [t, e] of this.cachedRays.entries()) {        // up to 200 ms of rays
      const i = this.physics.rayCastPlayerColliders(e.ray, filter);
      if (i) { this.didHitPlayer = true; sendHitByArrow(...); }
  }
  ```

  The flag does not break the loop, so two cached rays that both intersect a player in the same frame send two claims for one arrow. The first is accepted and calls `arrow.consume()`; the second arrives with `consumed = true` and strikes immediately. A six-arrow volley multiplies the number of arrows that can do this, which is why the kick started appearing after v5.7.0 and not before.
- **B — claim against a teammate.** `s_1(teamA, teamB)` false means same team, and the victim reports before any distance work.
- **C — claim the victim's copy never reaches.** Our arrow and their copy have the same direction and the same stock parabola, but their collider is where *they* are, not where our interpolated view puts them. A shot at a target that then runs perpendicular can leave the path outside 3 m for the whole second.

`combat/claims.js` guards the outbound op-7 with both rules:

```js
guard(v) {
    if (sameTeam(player, victim)) return drop();           // B
    if (seen.has(arrowId + ':' + victimId)) return drop();  // A
    const d = closestApproach(arrow, claimedColliderCenter);
    if (d > safeRadius(victim)) return drop();             // C
    return allow();
}

safeRadius(p) = clamp(min(3 - 0.45 - speed(p) * ping(p), claimTolerance), 0.4, 2.9)
```

`closestApproach` samples the arrow's real parabola and refines around the minimum, so a 400 m arc still measures to centimetres. The corridor leaves 0.45 m plus the interpolation error (velocity × ping) as margin, so a hit that passes the guard still passes the victim's 3 m test. **Assist** claims through the same gate, which is why a near miss is safe to convert and a wild shot is not worth trying.

### Why code 5 fires

```js
createServerArrow(t, ...) {
    const h = this.players.get(t);
    if (h.dead) h.report(5, 1);
    ...
}
```

Death is self-reported. `die()` calls `sendPerformAction(PlayerAction.DIE)`, which is `4`, and every other client runs `receivedPerformAction(4) → die()` on receipt. `playerChangeFlag` also reports code 5 for a dead player:

```js
playerChangeFlag(playerId, flagIndex, op) {
    const p = this.players.get(playerId);
    // 0 grab, 1 capture, 3 return
    (op == 0 || op == 1) ? p.dead && p.report(5, 1)
                         : op == 3 && p.dead && p.report(5, 1);
    ...
}
```

Dropping the outgoing `4` removes the arrow source. It never removed the flag source, because a flag op is a separate frame — and that is the path that produced a code 5 after ten minutes of a ragebot session where nobody died. The op is dropped twice now: at `sendPerformAction` and again at the socket. The socket test matches **action 4 alone**, not `action 4 AND id === S.myId`: only our own client ever sends an op-9 about us, and the cached id could be one match stale at the exact moment `die()` ran. That one stale id was enough to leak a DIE, and a leaked DIE costs the whole match — observers hide the model, refuse to kill it, and report every arrow. Flag ops (`op 6`) are dropped while dead and for the whole spawn window by the same rule.

An op-9 leaving the socket is about us by construction, so the router also takes the id out of it and repairs `S.myId` when the cache disagrees.

There is a third source, and it is the one that survives every client-side filter: **the server**. It learns our health from the `op22` we send as the victim:

```js
markValidArrowHit(shooter, arrow, collider) {
    if (this.applyDamage(...)) {
        network.sendValidArrowHit(shooter.id, arrow.arrowId, this.health);
    }
}
```

`setHealthFromHit` clamps `this.health` back to 1 under godmode, and the send happens *after* it, so the reported value is 1 and the server never sees a death. With godmode **off** the same line reports 0, the server marks the player dead, and every arrow after that is an action-while-dead violation from the server's own point of view. That is code 5 that no observer report caused and no packet filter can prevent. Ghost death therefore **implies godmode** and re-pins it every frame: a client cannot both hide its death and die.

If an observer ever ends up with a stale dead flag from an older build or a session where a DIE escaped, nothing local clears it: only a spawn op. **Anti-Cheat → Re-assert alive** sends `sendRequestRespawn`, which makes the server broadcast `receivedSpawn` (setting `dead = false` on every client), then restores your position 350 ms later.

The reverse race is the one that bit the live test: after our own respawn `me.dead` is already false locally, but an observer that has not processed the spawn op still has us dead for roughly one round trip. `ArrowBudget.graceLeft` holds every arrow — and now every flag op — for `spawnGraceMs` (900 ms) after a respawn transition.

The visible risk is manual review: three arrows leaving on the same tick, all head-height, is obvious to a spectator even with silent aim hiding the camera. Frequency caps keep it under the server's automated check; they do not make it look human. Active aimbot-style snapping is avoided entirely while silent aim is on, because the packet direction is rewritten rather than the camera.

## 11. FULL BYPASS

`src/anticheat/bypass.js` is the master pin. It is not a tenth check; it is the thing that keeps the existing nine from drifting apart mid-session.

The failure it fixes is mechanical. Guards are configuration, and configuration has four owners that do not coordinate:

- `applyPreset` writes ~70 keys in one `Object.assign`, and every preset is built on a different base.
- `loadCfg` merges an old saved object over `DEFAULTS`, so a key added after that save is absent until something writes it.
- sliders and selects write `CFG` directly from the UI.
- `Game.syncPatches` is keyed to `(mode, game)`, so a new match object leaves the report patch un-applied until the key changes.

So a session can start with every layer on and end with one of them quietly off, and the only symptom is a report ten minutes later.

`Bypass.tick()` runs before every combat tick and re-pins:

```js
ghostDeath, spawnGrace, snapGuard, claimGuard,
arrowBudget, blockServerJs, neuterReports, godmode  -> true
governor -> 'auto'
```

`governor: 'auto'` is deliberate, and it used to be `ghost` — that was wrong. Ghost mode is a synthetic grounded patrol: the position the wire carries is not the position the player is standing at. `createServerArrow` rewrites an arrow's origin to the shooter's camera on the observer when the packet origin is more than 3 m away, so in ghost mode every arrow flew from the observer's copy of a fake camera, the victim's parabola never reached the claimed collider, and nothing died while the local screen still showed hits. `auto` follows the fly mode: `sanitize` on the ground, `ghost` only when ghost flight is actually enabled. `Game.patchMode` is invalidated every 2 s so the report neuter is re-applied to whatever game object is current.

`enable()` snapshots the pre-enable value of every key and `disable()` writes those back, so OFF is a restore, not a defaults reset — a layer you had on by choice stays on.

**Auto re-assert.** The one state that no client can clear out of another client is a stale `dead` flag. `Bypass.tick()` watches `GhostDeath.blocks + GhostDeath.socketBlocks`; when either moves, one spawn op is queued 1.5 s later. `sendRequestRespawn` (op35) makes the server broadcast `receivedSpawn`, which sets `dead = false` on every client, and the saved position is rewritten 350 ms after. One spawn per signal, re-armed by the next signal.

## 12. Limits

- The observer thresholds are client-side but replicated on every client. Ghost mode hides the wire position; it does not hide the local camera from your own screen. Hop mode is visible and only stays clean because it lands before the 17 m up-travel / 10 s air-time windows fill.
- Sustained visible flight above roughly 5 m cannot be made undetected: if observers can see it, they are already running the anti-fly block on the same positions. Raw mode still streams it; hop mode is the visible cycle that resets the accumulators.
- Rapid fire is capped by the observer's own arrow-frequency check. Every send path charges one shared budget: 6 arrows per 2.4 s on the medium bow and 4 on the large bow, with the observer's stale timestamp already deducted. Over-budget arrows are dropped, never sent; a burst that lands inside the window reports code `4` from every client that sees it.
- Kill speed is capped by the victim, not by the cheat. `computeDamageWithCooldown` allows at most 0.9 health per rolling 1 s, so a full-health player cannot die in under ~1 s no matter how many arrows arrive. 1.05 s per target is the floor, and anything faster is wasted packets. The ragebot's job is to keep one arrow landing on every eligible target at that cadence, not to fire more arrows.
- Code 5 has two sources, and only one of them is arrows. `createServerArrow` reports a dead shooter, and `playerChangeFlag` reports a dead flag changer for grab/capture/return ops. The DIE frame is dropped at the method and at the socket; flag ops are dropped while dead and through spawn grace. What is left is an observer that already holds a stale dead flag — no local code can clear that on demand, only a spawn op. **Re-assert alive** sends one manually, and **FULL BYPASS** queues one automatically 1.5 s after any DIE block is counted.
- Silent aim can only rewrite an arrow whose solved parabola reaches the target. Partial draws at long range return `no arc`; a shot whose turn exceeds `Max turn` or that fails the visibility gate is left alone. The local arrow is patched to the rewritten direction; if the server ever rejects a rewrite, the local arrow still shows the intended path but the server arrow is authoritative. The `Silent trace` row shows the last 12 outcomes so an alternating pattern is diagnosable instead of guessable.
- Server-side speed/jump checks are inferred from the class stats and quantization. The speed multiplier is capped at 3× in the UI. Snap guard removes the local rubber-band (`setServerData` force → `setPosition`), but the server's copy of your position still lags behind yours, so hit registration and flag carries reconcile against a position you are not standing on. It is a comfort fix, not a server-side bypass.
- Snap guard suspends snap auto-bail on purpose: the same op4 correction keeps arriving, and tripping on it would disable the feature it was meant to protect. The governor still owns the outbound envelope, which is what the observers score.
- Godmode is local health authority, not server immunity. The victim client computes damage and reports remaining health on `op22`, and the patch makes that value 1 every time, but the shooter's client also sends `op7 hitByArrow` with the damage. If the server reconciles that stream itself, it can hold a different view of your health than your client; `forceSetHealthFromServer` (op33) is ignored while the toggle is on, so the display stays full. A kick from that divergence lands in the normal bail path.
- Spinbot is cosmetic to observers and free of server checks in the bundle. It does not move the camera, the aimbot, or the `op3` solve; players watching you see the model rotate. Automatic detection is not the risk — a human watching a 720°/s body is.
- The live bundle hash changes. The dumper exists because static offsets rot; the runtime paths (`game.players`, `getMyPlayer()`, `getCamPos()`, `getCamRot()`, `physicsManager.rayCastMapColliders`) are the stable API surface.
- `op55` blocking can break server-driven events. Toggle it off if a match stops advancing.
- This is not an anti-cheat bypass for a server-side replay or manual review. It is a stream governor that keeps the client-side observer math at zero.
