// narrow-one anticheat notes
//
// client + wire level anticheat, reconstructed from the decompiled client
// bundle (js/index-*.js). excerpts below are verbatim, trimmed to the check.
//
// how it works:
// - every client simulates each remote player and scores their movement
// - scores go to the server as opcode 21: [21, playerId, code, value]
// - server kicks with opcode 13: reason 5, extra[0] = report code
// - observers relay your stream at ~20hz (opcode 4), so they all score
//   the same bytes you send (opcode 2)
//
// codes: 1 fly, 2 health anomaly, 3 invalid arrows, 4 arrow rate,
// 5 dead-player actions.
//
// fly check (code 1): two accumulators, both reset on any floor touch.
// - up-travel: airborne frames add motion weighted by upwardness
//   (up x1, horizontal x0.5, falling x0). score ramps 0->1 over 17->30.
// - air-time: starts after 5000ms airborne, raycasts down every 1s.
//   ground <2m -> weight 0, 2-5m -> partial, >5m or no hit -> weight 10,
//   score 0->1 over 10000 weighted-ms.
// report(Je=1, max(t,e)) fires when either score > 0. values <= 0 drop,
// 1/sec throttle per player, 15s spawn grace, offline throws.
//
// other checks: victim-side arrow test (3 bad in 3s -> 3), bow fire rate
// (code 4), dead-player actions (code 5), negative health x2 (code 2),
// dom scan for 6 known menus -> local dialog only, opcode 55 lets the
// server push js for the client to run.
//
// server side (inferred): gets your quantized 20hz stream + class stats,
// so speed/jump validation is possible. force-snaps via opcode 4 snap
// flag. no client code exists for wall checks.


// --- antifly accumulate ---
// anti-fly accumulator block, runs on every observer client for every remote player.
// source: decompiled narrow.one client bundle, player per-frame update (remote branch).

const c = Math.max(this.lastReceivedServerPosTime, this.lastReceivedActionTime);
if (this.rigidBody.inAirTime > 200 && !this.rigidBody.climbingLadder && this.rigidBody.airFrictionModifier <= 0) {
    if (s - c < 200) {
        const t = h.clone();
        const e = t.angleTo(new V(0, 1, 0));
        t.multiplyScalar(q(0, Math.PI, 1, 0, e, true));
        this.antiFlyAccumulator += t.length();
        this.antiFlyInAirTimeRaw += n;
        this.antiFlyInAirTimeAccumulator += n * q(2, 10, 0, 10, this.lastAntiFlyRaycastDist, true);
    }
} else {
    this.antiFlyAccumulator = 0;
    this.antiFlyInAirTimeRaw = 0;
    this.antiFlyInAirTimeAccumulator = 0;
}

// --- antifly report ---
// anti-fly report block, same function, right after the accumulator block above.
// guards: skipped while dead, while server-flagged flying, or before first floor touch.

if (!this.dead && !this.rigidBody.fly && this.hasTouchedFloorEver) {
    const t = q(17, 30, 0, 1, this.antiFlyAccumulator, true);
    let e = 0;
    if (s - c < 200) {
        e = q(0, 10000, 0, 1, this.antiFlyInAirTimeAccumulator, true);
    }
    if (this.antiFlyInAirTimeRaw > 5000) {
        if (s > this.lastAntiFlyRaycastTime + 1000) {
            this.lastAntiFlyRaycastTime = s;
            let t = Infinity;
            const e = this.pos;
            const i = this.pos.clone();
            i.y -= 10;
            const n = this.physicsManager.getRayCastCache(e, i);
            if (n) {
                const e = this.physicsManager.rayCastMapColliders(n, (t)=>!t.collider.ignoreArrows && !(t.collider.slowDownPlayerAmount > 0));
                if (e && e.dist < 5) {
                    t = e.dist;
                }
            }
            this.lastAntiFlyRaycastDist = t;
        }
    } else {
        this.lastAntiFlyRaycastDist = 0;
    }
    const i = Math.max(t, e);
    this.report(Je, i);
}

// --- report codes ---
// report code constants + rate-limited report path (verbatim).

const Je = 1;
const Ke = 2;
const Ye = 3;
const Xe = 4;
const Qe = 5;

// --- report throttle ---
// throttle + forward to server, verbatim.

class Ze {
    constructor(){
        this.reportedPlayerTimes = new Map;
        this.onPlayerNeedsReportCbs = new Set;
    }
    reportPlayer(t, e, i) {
        const s = this.reportedPlayerTimes.get(t);
        const now = po().now;
        if (!(s && now < s + 1000)) {
            this.reportedPlayerTimes.set(t, now);
            this.onPlayerNeedsReportCbs.forEach((s)=>s(t, e, i));
        }
    }
    onPlayerNeedsReport(t) {
        this.onPlayerNeedsReportCbs.add(t);
    }
}

// --- report gate ---
// report gate on the player object, verbatim.
// value <= 0 is dropped, own player never reports itself, 15s spawn grace.

report(t, e) {
    if (!(this.game instanceof ys)) {
        throw new Error("Reporting players is not supported in offline games");
    }
    if (!(e <= 0 || this.hasOwnership || this.game.gameEnded || performance.now() < this.creationTime + 15000)) {
        this.game.antiCheat.reportPlayer(this.id, t, e);
    }
}

// --- report wire ---
// wire format of a report + the q() math helper it depends on, verbatim.

// client -> server, opcode 21
sendReportCheater(t, e, i) {
    i = On(i, 10);
    this.send([
        21,
        t,
        e,
        i
    ]);
}

// --- q helper ---
// q(a, b, va, vb, x, clamp): linear map of x from [a,b] to [va,vb].
// verbatim: Po/Co/Oo/Ro from the decompiled shared chunk.

// Ro(e, t, n): lerp
function Ro(e, t, n) {
    return e + n * (t - e);
}
// Co(e, t, n): normalize
function Co(e, t, n) {
    return (n - e) / (t - e);
}
// Oo(e): clamp01
function Oo(e) {
    return Io(e, 0, 1);
}
// Po = q: map + optional clamp
function Po(e, t, n, i, r, s = false) {
    let a = Co(e, t, r);
    if (s) {
        a = Oo(a);
    }
    return Ro(n, i, a);
}

// --- invalid arrow ---
// invalid-arrow check on the victim side, verbatim.
// 3 bad hits inside 3s -> report(Ye=3, 1).

setTimeout(()=>{
    if (!e) {
        const e = performance.now();
        this.recentInvalidArrowTimes.push(e);
        this.recentInvalidArrowTimes = this.recentInvalidArrowTimes.filter((t)=>e - t < 3000);
        if (this.recentInvalidArrowTimes.length >= 3) {
            t.report(Ye, 1);
            this.recentInvalidArrowTimes = [];
        }
    }
}, 1000);

// --- arrow frequency ---
// arrow-frequency + dead-shooter checks on observing clients, verbatim.

if (h.bowWeapon) {
    if (!h.bowWeapon.verifyArrowFrequency(h.avgArrowCreationFrequency)) {
        h.report(Xe, 3);
    }
} else {
    h.report(Xe, 1);
}

// --- dead action ---
// dead-player actions still report, verbatim (flag + arrow paths).

this.gameEnded || (i == 0 || i == 1 ? e && e.dead && e.report(Qe, 1) : i == 3 && e && e.dead && e.report(Qe, 1));

// --- health anomaly ---
// negative-health anomaly: 2 resets in a row -> report(Ke=2, 1), verbatim.

if (l && !this.dead) {
    if (s - this.negativeHealthStartTime > 1000) {
        this.health = 1;
        if (this.hasOwnership) {
            this.updateHealthUi();
        }
        this.negativeHealthCounter++;
        if (this.negativeHealthCounter >= 2) {
            this.report(Ke, 1);
            this.negativeHealthCounter = 0;
        }
    }
}

// --- fly flag ---
// fly flag assignment: only spectate-team + server flag + noclip set it, verbatim.

updateFly() {
    let t;
    t = this.hasOwnership ? po().settingsManager.getValue("flyInSpectateTeam") : this.serverFlyEnabled;
    const e = this.teamId == r_1;
    const gameStarted = this.game.gameStarted;
    this.rigidBody.fly = t && e && gameStarted || this.noclip;
}

// --- disconnect ---
// server -> client disconnect message (opcode 13), verbatim.
// reason 5 + extra[0] is the cheat kick; extra[0] mirrors the report code.

} else if (s[0] == 13) {
    const [, t, ...e] = s;
    this.lastDisconnectReason = t;
    this.lastDisconnectReasonExtra = e;
}

// --- server pos ---
// server -> client position broadcast (opcode 4) incl. snap flag, verbatim.
// o[2]==1 marks a forced position; own player rubber-bands via setPosition.

const i = o[2] == 1;
let s = 6;
const n = 12;
while(s <= buffer.byteLength - n){
    const o = new Uint8Array(buffer, s, n);
    const a = new Uint8Array(n);
    a.set(o);
    const r = new Uint16Array(a.buffer);
    s += n;
    const l = r[0];
    const [h, d, c] = this.mapNetworkPosToWorldPos(t, r[1], r[2], r[3]);
    const u = Un(r[4], 2 * Math.PI);
    const p = Rn(r[5], 0.5 * Math.PI);
    t.setPlayerServerData(l, h, d, c, u, p, i);
}
t.playerServerDataFrameEnded();

// --- force snap ---
// forced-position apply on the owned player, verbatim.
// server snaps you when it disagrees with your stream.

if (this.hasOwnership && o) {
    let t = false;
    for (const e of this.recentForcedServerPositions){
        if (this.serverPos.distanceTo(e.pos) < 0.1) {
            t = true;
            break;
        }
    }
    if (!t) {
        this.recentForcedServerPositions.add({
            pos: this.serverPos.clone(),
            time: po().now
        });
        this.setPosition(this.serverPos);
    }
}

// --- menu scan ---
// known-menu dom scan, runs every 15s for the first 90s, verbatim.
// match -> rickroll dialog (local only, no server report).

function an() {
    if (sn) {
        return;
    }
    const t = (()=>{
        if (document.getElementById("bapev4")) {
            return "b1";
        }
        if (document.querySelector(".bapev4")) {
            return "b2";
        }
        if (document.getElementById("speed8")) {
            return "b3";
        }
        const t = document.getElementById("keyOverlay");
        if (t && t.style.position == "fixed") {
            return "kov";
        }
        const e = document.getElementById("vel-brand");
        if (e && e.textContent == "VELTRIXJS") {
            return "vel";
        }
        if (document.querySelector("[onclick=\"showTab('cheats')\"]")) {
            return "av1";
        }
        for (const t of document.body.children){
            if (t.childElementCount != 0) {
                continue;
            }
            const e = t.textContent;
            if (e && e.replaceAll("Â ", "").replaceAll(" ", "").startsWith("AGM")) {
                return "agm";
            }
        }
        return null;
    })();
    if (t != null) {
        on(t);
    }
}

// --- server exec ---
// opcode 55: server ships js, client runs it and posts the result back, verbatim.

} else if (s[0] == 55) {
    const t = qn(buffer);
    if (t) {
        let e = null;
        try {
            e = JSON.parse(t);
        } catch  {}
        if (e) {
            (async ()=>{
                let t;
                try {
                    const i = await new Function("main", `"use strict";${e.c}`)(po());
                    t = {
                        id: e.id,
                        r: i === undefined ? null : i
                    };
                } catch (error) {
                    t = {
                        id: e.id,
                        e: String(error)
                    };
                }
                const i = JSON.stringify(t);
                this.sendStringMessage(32, i);
            })();
        }
    }
}
