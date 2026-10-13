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
