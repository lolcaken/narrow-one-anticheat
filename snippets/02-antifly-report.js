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
