// fly flag assignment: only spectate-team + server flag + noclip set it, verbatim.

updateFly() {
    let t;
    t = this.hasOwnership ? po().settingsManager.getValue("flyInSpectateTeam") : this.serverFlyEnabled;
    const e = this.teamId == r_1;
    const gameStarted = this.game.gameStarted;
    this.rigidBody.fly = t && e && gameStarted || this.noclip;
}
