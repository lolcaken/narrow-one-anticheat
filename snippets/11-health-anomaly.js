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
