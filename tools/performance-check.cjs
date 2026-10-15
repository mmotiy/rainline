const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const output = process.env.RAINLINE_QA_DIR || path.join(require('node:os').tmpdir(), 'rainline-perf');
fs.mkdirSync(output, {recursive: true});
const probe = `
window.__perf = {renderer, scene, camera, composer, POOL, CELL_LIST, STREAM, gtao,
  renderGtaoOverride, optimizedGtaoOverride: gtao.renderOverride,
  applyQuality, updateStreaming, TOD, weather, U,
  survey(i, j, time) {
    const pos = nodeXZ([i, j]);
    player.teleport(pos.x, pos.z, Math.PI);
    save.settings.tod = time;
    game.state = 'drive'; game.camYaw = Math.PI;
    window.__rainline.step(20); game.state = 'pause';
  },
  driveSmoke() {
    this.survey(4, 4, 'night');
    setState('drive');
    const start = {x: player.s.x, z: player.s.z};
    keys.add('KeyW');
    let maxSpeed = 0;
    for (let i = 0; i < 240; i++) {
      window.__rainline.step(1);
      maxSpeed = Math.max(maxSpeed, player.speed);
    }
    keys.delete('KeyW');
    game.state = 'pause';
    return {distance: Math.hypot(player.s.x-start.x, player.s.z-start.z),
      maxSpeed, pixelRatio, gpuMs: game.gpuMs};
  },
  async continuous(enabled) {
    this.survey(4, 4, 'night');
    for (const {bm} of POOL.values()) { bm.perObjectFrustumCulled = enabled; bm._visibilityChanged = true; }
    gtao.renderOverride = enabled ? this.optimizedGtaoOverride : renderGtaoOverride;
    setState('drive'); keys.add('KeyW');
    const intervals = [], cpu = [], gpu = [];
    let previous = 0;
    for (let i = 0; i < 240; i++) {
      const now = await new Promise(resolve => requestAnimationFrame(resolve));
      const start = performance.now(); window.__rainline.step(1);
      if (i === 59) gpuTimer.reset();
      if (i >= 60) {
        intervals.push(now - previous); cpu.push(performance.now() - start);
        if (game.gpuMs !== null) gpu.push(game.gpuMs);
      }
      previous = now;
    }
    keys.delete('KeyW'); game.state = 'pause';
    const percentile = (values, fraction) => values.sort((a,b) => a-b)[Math.min(values.length-1, Math.floor(values.length*fraction))];
    return {medianFrameMs: percentile(intervals, 0.5), p99FrameMs: percentile(intervals, 0.99),
      medianCpuMs: percentile(cpu, 0.5), medianGpuMs: percentile(gpu, 0.5), pixelRatio,
      averageFps: 1000 * intervals.length / intervals.reduce((a,b) => a+b, 0)};
  },
  checkStreaming() {
    let mismatches = 0;
    let visited = 0;
    let full = 0;
    for (const quality of ['low', 'ultra', 'high', 'ultra']) {
      applyQuality(quality);
      for (const [x, y, z] of [[0, 2, 0], [-300, 2, 300], [300, 100, -300], [9000, 2, 9000], [0, 2, 0]]) {
        const radii = [[CELL_LIST.bldg, Q.near + SCELL * 1.8, Q.lod0],
          [CELL_LIST.flat, Q.nearFlat + SCELL * 1.8, Q.lod0],
          [CELL_LIST.prop, Q.props, Math.min(Q.lod0, 40)]];
        for (const [list, load] of radii) {
          visited += queryCells(CELL_INDEX.get(list), x, z, load).length;
          full += list.length;
        }
        updateStreaming(x, y, z, true);
        for (const [list, load, lod] of radii) for (const cell of list) {
          const d = Math.sqrt((cell.x-x)**2 + (cell.y-y)**2 + (cell.z-z)**2);
          if (cell.state !== (d < lod ? 2 : d < load ? 1 : 0)) mismatches++;
        }
      }
    }
    pixelRatio = basePR = 1; resize();
    return {mismatches, visited, full};
  },
  prepare() {
    applyQuality('ultra');
    pixelRatio = basePR = 1; resize();
    save.settings.tod = 'night'; save.settings.shake = false;
    game.state = 'drive';
    window.__rainline.step(30);
    game.state = 'pause';
    document.querySelector('#title').hidden = true;
  },
  render() {
    renderer.info.autoReset = false; renderer.info.reset();
    composer.render(0);
    const result = {...renderer.info.render};
    renderer.info.autoReset = true;
    return result;
  }
};
`;
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = pathname === '/' ? path.join(root, 'index.html') : path.join(root, pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    if (pathname === '/') {
      const source = fs.readFileSync(file, 'utf8').replace('boot();\n', 'boot();\n' + probe);
      res.setHeader('Content-Type', 'text/html'); res.end(source);
    } else {
      res.setHeader('Content-Type', file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
      const stream = fs.createReadStream(file);
      stream.on('error', () => res.writeHead(404).end());
      stream.pipe(res);
    }
  } catch (error) { res.writeHead(404).end(error.message); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
  try {
    const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      let seed = 12345;
      Math.random = () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};
    });
    await page.goto('http://127.0.0.1:' + server.address().port + '/?manual');
    await page.waitForFunction(() => window.__rainline, {timeout: 180000});
    await page.evaluate(() => window.__perf.prepare());
    const result = await page.evaluate(async () => {
      const p = window.__perf;
      const gl = p.renderer.getContext();
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const hardware = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      const configuredCulling = [...p.POOL.values()].every(({bm}) => bm.perObjectFrustumCulled);
      async function measure(enabled, samples = 30) {
        p.gtao.renderOverride = enabled ? p.optimizedGtaoOverride : p.renderGtaoOverride;
        for (const {bm} of p.POOL.values()) { bm.perObjectFrustumCulled = enabled; bm._visibilityChanged = true; }
        for (let i = 0; i < 5; i++) p.render();
        gl.finish();
        const cpu = [], gpu = [];
        let stats;
        for (let i = 0; i < samples; i++) {
          const q = ext && gl.createQuery();
          if (q) gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
          const start = performance.now(); stats = p.render(); cpu.push(performance.now() - start);
          if (q) gl.endQuery(ext.TIME_ELAPSED_EXT);
          gl.finish();
          if (q) {
            while (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) await new Promise(r => setTimeout(r, 1));
            if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
            gl.deleteQuery(q);
          }
        }
        const pixels = new Uint8Array(1920 * 1080 * 4);
        p.render(); gl.readPixels(0, 0, 1920, 1080, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const median = a => a.length ? a.sort((a,b) => a-b)[Math.floor(a.length / 2)] : null;
        return {stats, cpuMs: median(cpu), gpuMs: median(gpu), pixels};
      }
      function compare(off, on) {
        let changed = 0, total = 0, max = 0, brightness = 0;
        for (let i = 0; i < off.pixels.length; i += 4) {
        let d = 0;
        for (let c = 0; c < 3; c++) {const v = Math.abs(off.pixels[i+c] - on.pixels[i+c]); total += v; max = Math.max(max, v); d = Math.max(d, v);}
        if (d > 3) changed++;
        brightness += off.pixels[i] + off.pixels[i+1] + off.pixels[i+2];
        }
        delete off.pixels; delete on.pixels;
        return {changedFraction: changed / (1920 * 1080), meanError: total / (1920 * 1080 * 3), max, brightness};
      }
      const off = await measure(false), on = await measure(true);
      const image = compare(off, on);
      const streaming = p.checkStreaming();
      const scenarios = [];
      for (const [i, j, time] of [[4, 4, 'night'], [1, 8, 'day'], [8, 2, 'dusk']]) {
        p.survey(i, j, time);
        const before = await measure(false, 12), after = await measure(true, 12);
        scenarios.push({i, j, time, before, after, image: compare(before, after)});
        p.camera.rotateY(Math.PI); p.camera.updateMatrixWorld();
        const reverseBefore = await measure(false, 4), reverseAfter = await measure(true, 4);
        scenarios.push({i, j, time, reversed: true, before: reverseBefore, after: reverseAfter, image: compare(reverseBefore, reverseAfter)});
      }
      return {hardware, off, on, image, configuredCulling, streaming, scenarios};
    });
    await page.screenshot({path: path.join(output, 'culling-ultra.png')});
    result.drive = await page.evaluate(() => window.__perf.driveSmoke());
    await page.screenshot({path: path.join(output, 'driving-ultra.png')});
    result.continuous = {};
    for (const enabled of [false, true]) {
      const driving = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1});
      driving.on('pageerror', error => errors.push(error.message));
      await driving.addInitScript(() => {
        let seed = 12345;
        Math.random = () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};
      });
      await driving.goto('http://127.0.0.1:' + server.address().port + '/?manual');
      await driving.waitForFunction(() => window.__rainline, {timeout: 180000});
      await driving.evaluate(() => window.__perf.prepare());
      result.continuous[enabled ? 'after' : 'before'] = await driving.evaluate(enabled => window.__perf.continuous(enabled), enabled);
      await driving.close();
    }
    result.errors = errors;
    // Restore the configured default to test the shipped behavior, not the override.
    fs.writeFileSync(path.join(output, 'culling.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    assert.equal(errors.length, 0, 'Game must load without script errors');
    assert.ok(result.drive.distance > 5 && result.drive.maxSpeed > 2, 'Driving and streaming must remain functional');
    assert.equal(result.drive.pixelRatio, 1, 'Checks must not silently reduce resolution');
    assert.equal(result.continuous.before.pixelRatio, 1);
    assert.equal(result.continuous.after.pixelRatio, 1);
    assert.ok(result.on.stats.triangles < result.off.stats.triangles * 0.8, 'Culling must remove meaningful geometry');
    assert.ok(result.image.changedFraction < 0.001, 'Culling must preserve visible pixels, including shadows');
    assert.ok(result.configuredCulling, 'City pools must enable camera-specific culling by default');
    assert.equal(result.streaming.mismatches, 0, 'Streaming must match the full-scan reference across presets and teleports');
    assert.ok(result.streaming.visited < result.streaming.full / 2, 'Spatial index must skip most city cells');
    for (const scenario of result.scenarios) {
      assert.ok(scenario.image.brightness > 1000000, 'Pixel comparison must contain a rendered scene');
      assert.ok(scenario.image.changedFraction < 0.001, 'Camera turns and streaming must preserve the image');
    }
    const pairs = [[result.off, result.on], ...result.scenarios.map(s => [s.before, s.after])];
    if (pairs.every(([before, after]) => before.gpuMs !== null && after.gpuMs !== null)) {
      const before = pairs.reduce((sum, [sample]) => sum + sample.gpuMs, 0);
      const after = pairs.reduce((sum, [, sample]) => sum + sample.gpuMs, 0);
      assert.ok(after < before * 0.95, 'Combined GPU render time must improve by at least 5% across sampled views');
    }
  } finally { await browser.close(); server.close(); }
})().catch(error => {console.error(error); process.exitCode = 1; server.close();});
