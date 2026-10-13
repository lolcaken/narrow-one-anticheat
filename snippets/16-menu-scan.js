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
            if (e && e.replaceAll(" ", "").replaceAll(" ", "").startsWith("AGM")) {
                return "agm";
            }
        }
        return null;
    })();
    if (t != null) {
        on(t);
    }
}
