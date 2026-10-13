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
