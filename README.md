# Rainline

[Play in your browser](https://mmotiy.github.io/rainline/).

Rainy city racing game using Three.js r170, WebGL2 and Rapier. Serve this
directory over HTTP; opening `index.html` directly as a file will not load ES modules.

## Controls

W/S drive and brake; A/D steer; Space handbrake; Shift nitrous; E interact;
C camera; M map; R reset; Esc pause.

## Rendering optimizations

- City geometry is culled in conservative spatial groups. Each rendering pass
  uses its own camera, so offscreen shadow casters remain available.
- Instance bounds are cached when streaming loads or reuses a slot. Draw order
  remains unchanged, including transparent materials.
- The AO normal pass reuses the colour pass's shadows instead of drawing them
  twice. Dynamic shadows in the colour pass still update every frame.
- Streaming checks nearby spatial buckets plus previously loaded cells instead
  of scanning the entire city. LOD distances and quality presets are unchanged.
- GPU diagnostics use asynchronous timer queries when supported; renderer
  submission time is tracked separately from GPU time. Initial shader warmup
  is excluded from samples.

The existing adaptive resolution behavior remains enabled. Performance checks
fix the internal pixel ratio to 1 at 1920×1080 so gains cannot come from reducing
the test resolution. Rain, bloom, AO, SMAA, shadow resolution and view distances
are kept at Ultra during those checks.

`city-batch.mjs` deliberately adapts internal BatchedMesh draw-list fields from
the pinned Three.js **0.170.0**. Re-run image, streaming and performance checks
before upgrading that dependency.

## Verification

Run the dependency-free unit checks with Node.js:

```sh
node --test tools/streaming.test.mjs tools/gpu-timer.test.mjs
```

The browser check requires the `playwright` Node package and Google Chrome
installed at the Windows default location:

```sh
node tools/performance-check.cjs
```

It compares rendering with culling/shadow reuse disabled and enabled, checks
pixels in seven fixed views, validates streaming across quality changes and
teleports, and runs continuous driving in separately seeded pages. The spatial
index is used in both rendering comparisons; its correctness and candidate
counts are checked separately against full-scan distance decisions.

Reports and screenshots go to the system temporary directory under
`rainline-perf`, or to `RAINLINE_QA_DIR` if set. Tests launch a temporary local
server and close both server and browser when finished.

Results from an RTX 3080 do not establish frame rates on lower-end GPUs.
Continuous-driving frame intervals include browser scheduling. Paused-frame GPU
benchmarks synchronize between samples for comparison and are not gameplay FPS.

## Assets

Existing in-game credits: “Car Concept” by Eric Chadwick / Darmstadt Graphics
Group (CC BY 4.0); “Toyota GR Supra GT300” by vecarz (CC BY 4.0, livery removed);
Poly Haven lighting HDRIs (CC0). City modules generated for Rainline.
