// q(a, b, va, vb, x, clamp): linear map of x from [a,b] to [va,vb].
// verbatim: Po/Co/Oo/Ro from the decompiled shared chunk.

// Ro(e, t, n): lerp
function Ro(e, t, n) {
    return e + n * (t - e);
}
// Co(e, t, n): normalize
function Co(e, t, n) {
    return (n - e) / (t - e);
}
// Oo(e): clamp01
function Oo(e) {
    return Io(e, 0, 1);
}
// Po = q: map + optional clamp
function Po(e, t, n, i, r, s = false) {
    let a = Co(e, t, r);
    if (s) {
        a = Oo(a);
    }
    return Ro(n, i, a);
}
