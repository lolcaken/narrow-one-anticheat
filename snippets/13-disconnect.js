// server -> client disconnect message (opcode 13), verbatim.
// reason 5 + extra[0] is the cheat kick; extra[0] mirrors the report code.

} else if (s[0] == 13) {
    const [, t, ...e] = s;
    this.lastDisconnectReason = t;
    this.lastDisconnectReasonExtra = e;
}
