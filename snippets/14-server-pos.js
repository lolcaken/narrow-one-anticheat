// server -> client position broadcast (opcode 4) incl. snap flag, verbatim.
// o[2]==1 marks a forced position; own player rubber-bands via setPosition.

const i = o[2] == 1;
let s = 6;
const n = 12;
while(s <= buffer.byteLength - n){
    const o = new Uint8Array(buffer, s, n);
    const a = new Uint8Array(n);
    a.set(o);
    const r = new Uint16Array(a.buffer);
    s += n;
    const l = r[0];
    const [h, d, c] = this.mapNetworkPosToWorldPos(t, r[1], r[2], r[3]);
    const u = Un(r[4], 2 * Math.PI);
    const p = Rn(r[5], 0.5 * Math.PI);
    t.setPlayerServerData(l, h, d, c, u, p, i);
}
t.playerServerDataFrameEnded();
