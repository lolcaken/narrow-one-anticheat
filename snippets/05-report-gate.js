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
