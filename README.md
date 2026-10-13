# narrow-one anticheat notes

verbatim excerpts from the decompiled client in `narrow-one-anticheat.js`. no bypass code here.

## detection loop

- every client simulates every other player and scores their movement
- scores go up as opcode 21: `[21, playerId, code, value]`
- server kicks with opcode 13: reason 5, `extra[0]` = code
- everyone scores the same ~20hz position stream (opcode 4 relays what you send as opcode 2)

codes: 1 fly, 2 health, 3 bad arrows, 4 fire rate, 5 dead actions.

## fly (code 1)

two accumulators, both reset on floor touch:

- up-travel: airborne motion weighted by upwardness (up x1, sideways x0.5, falling x0). score 0->1 across 17->30. fires before 5s on real flight.
- air-time: starts after 5000ms airborne, raycasts down every 1s. ground <2m = weight 0, 2-5m = partial, >5m or no hit = weight 10. score 0->1 across 10000 weighted-ms.

`report(Je=1, max(t,e))` when either > 0. zero values drop, 1/sec throttle, 15s spawn grace.

seen live: t non-zero ~4s in, e pegs ~1s after the 5s mark, then `reason=5 extra=[1]`.

## rest

- arrows: victim tests the segment vs its collider, 3 bad in 3s -> 3. too fast -> 4. fired while dead -> 5.
- health resets twice -> 2.
- menu scan checks the dom for 6 known menus -> local dialog only, nothing sent.
- opcode 55 lets the server push js for the client to run.

## server (inferred)

- quantized 20hz stream + class stats -> speed/jump checks possible.
- force-snaps via opcode 4 snap flag when it disagrees.
- no client code for wall checks, so those live server side if at all.
