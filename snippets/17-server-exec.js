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
