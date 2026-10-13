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
