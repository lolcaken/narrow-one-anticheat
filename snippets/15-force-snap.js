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
