// wire format of a report + the q() math helper it depends on, verbatim.

// client -> server, opcode 21
sendReportCheater(t, e, i) {
    i = On(i, 10);
    this.send([
        21,
        t,
        e,
        i
    ]);
}
