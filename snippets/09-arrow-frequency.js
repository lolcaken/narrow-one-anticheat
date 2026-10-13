// arrow-frequency + dead-shooter checks on observing clients, verbatim.

if (h.bowWeapon) {
    if (!h.bowWeapon.verifyArrowFrequency(h.avgArrowCreationFrequency)) {
        h.report(Xe, 3);
    }
} else {
    h.report(Xe, 1);
}
