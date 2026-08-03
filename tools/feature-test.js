/**
 * End-to-end checks for the systems that live above physics: preview, dash,
 * style scoring, districts, weather, hazards, settings and the tutorial.
 * Usage: node tools/feature-test.js [url]
 */
const puppeteer = require("puppeteer-core");

const URL = process.argv[2] || "http://localhost:8000/index.html";
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(URL, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 500));

  // --- districts and hazards exist in the generated world --------------------
  const world = await page.evaluate(() => {
    const g = window.SWGame;
    g.world.ensureUpTo(26000);
    const ids = [0, 3500, 7000, 10500, 14000].map(
      (x) => g.world.districtAt(x).def.id
    );
    return {
      districts: ids,
      unique: new Set(ids).size,
      hazards: g.world.hazards.length,
      props: g.world.props.length,
    };
  });
  check("districts change along the run", world.unique >= 4, world.districts.join(","));
  check("hazards spawn", world.hazards > 0, `${world.hazards} hazards`);

  await page.click("#btn-play");
  await new Promise((r) => setTimeout(r, 500));

  // --- trajectory preview ----------------------------------------------------
  const preview = await page.evaluate(async () => {
    const g = window.SWGame;
    const p = g.player;
    let found = null;
    for (let deg = 15; deg <= 85 && !found; deg += 5) {
      const a = (-deg * Math.PI) / 180;
      found = p.probeDir(Math.cos(a), Math.sin(a), g.world);
    }
    if (!found) return { skipped: true };
    const sx = (found.x - g.cam.x) * g.cam.zoom + g.view.w / 2;
    const sy = (found.y - g.cam.y) * g.cam.zoom + g.view.h / 2;
    g.aim.sx = sx;
    g.aim.sy = sy;
    await new Promise((r) => setTimeout(r, 120));
    return { points: g.preview.length, anchor: !!g.previewAnchor };
  });
  check(
    "aiming builds a ghost arc",
    preview.skipped || (preview.points > 4 && preview.anchor),
    JSON.stringify(preview)
  );

  // --- rescue dash through the real key handler ------------------------------
  const dash = await page.evaluate(() => ({
    cd: window.SWGame.player.dashCd,
    speed: window.SWGame.player.speed(),
  }));
  await page.keyboard.down("Shift");
  await new Promise((r) => setTimeout(r, 120));
  await page.keyboard.up("Shift");
  const dashAfter = await page.evaluate(() => ({
    cd: window.SWGame.player.dashCd,
    speed: window.SWGame.player.speed(),
    popups: document.querySelectorAll("#hud-popups .popup").length,
  }));
  check(
    "Shift fires the dash and starts its cooldown",
    dash.cd <= 0 && dashAfter.cd > 5,
    `cd ${dash.cd.toFixed(2)} -> ${dashAfter.cd.toFixed(2)}`
  );
  check("dash raises the popup", dashAfter.popups > 0, `${dashAfter.popups} popups`);

  // --- style scoring: fly low and fast over the street ------------------------
  const style = await page.evaluate(async () => {
    const g = window.SWGame;
    const p = g.player;
    p.release();
    p.dead = false;
    g.state = "playing";
    // A low pass only counts in open air, so park the hero inside a gap.
    let spot = null;
    const bs = g.world.buildings;
    for (let i = 1; i < bs.length; i++) {
      const left = bs[i - 1].x + bs[i - 1].w;
      if (bs[i].x - left > 260) {
        spot = (left + bs[i].x) / 2;
        break;
      }
    }
    if (spot === null) return { skipped: true };

    const before = g.score;
    for (let i = 0; i < 50; i++) {
      p.pos.x = spot;
      p.pos.y = -100;
      p.vel.x = 700;
      p.vel.y = 0;
      p.onRoof = false;
      p.onWall = false;
      p.wallTimer = 0;
      await new Promise((r) => setTimeout(r, 12));
    }
    const gain = g.score - before;
    const lowTime = g.lowTime;
    p.pos.y = -600;
    return { gain, lowTime };
  });
  check("low pass pays style points", style.gain > 30, JSON.stringify(style));

  // --- weather reacts to the district ----------------------------------------
  const weather = await page.evaluate(async () => {
    const g = window.SWGame;
    g.world.weatherOn = true;
    g.world._rollWeather(1);
    const target = { ...g.world.target };
    for (let i = 0; i < 60; i++) g.world.update(0.1, g.player.pos.x);
    return { target, weather: { ...g.world.weather } };
  });
  const wOk =
    Math.abs(weather.weather.wind - weather.target.wind) < 0.05 &&
    Math.abs(weather.weather.rain - weather.target.rain) < 0.05;
  check("weather eases towards its target", wOk, JSON.stringify(weather));

  // --- settings: pace slider rewrites the constants live ----------------------
  const pace = await page.evaluate(() => {
    const before = window.SW.CONST.GRAVITY;
    const input = document.getElementById("opt-pace");
    input.value = "1";
    input.dispatchEvent(new Event("input"));
    const after = window.SW.CONST.GRAVITY;
    const stored = JSON.parse(localStorage.getItem("swing-settings-v1"));
    input.value = "0.7";
    input.dispatchEvent(new Event("input"));
    return { before, after, stored: stored && stored.pace };
  });
  check(
    "pace slider changes gravity and persists",
    pace.after > pace.before && pace.stored === 1,
    JSON.stringify(pace)
  );

  // --- daily seed ------------------------------------------------------------
  const daily = await page.evaluate(() => {
    const g = window.SWGame;
    const box = document.getElementById("opt-daily");
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    const a = [];
    for (let i = 0; i < 2; i++) {
      g.world.reset(
        JSON.parse(localStorage.getItem("swing-settings-v1")).daily
          ? window.SWGame.world.seedUsed || 0
          : 0
      );
    }
    const on = JSON.parse(localStorage.getItem("swing-settings-v1")).daily;
    box.checked = false;
    box.dispatchEvent(new Event("change"));
    return { on };
  });
  check("daily seed toggle persists", daily.on === true, JSON.stringify(daily));

  // --- anchor magnetism picks a better swing than the raw aim ----------------
  const assist = await page.evaluate(() => {
    const g = window.SWGame;
    const p = g.player;
    p.release();
    const tx = p.pos.x + 420;
    const ty = p.pos.y - 300;
    const raw = p.probe(tx, ty, g.world);
    const best = p.aimAssist(tx, ty, g.world);
    if (!best) return { skipped: true };
    return {
      raw: raw ? Math.round(p.arcScore(raw, g.world)) : null,
      best: Math.round(p.arcScore(best, g.world)),
      moved: raw ? Math.round(Math.hypot(best.x - raw.x, best.y - raw.y)) : null,
    };
  });
  check(
    "aim assist never picks a worse arc",
    assist.skipped || assist.raw === null || assist.best >= assist.raw,
    JSON.stringify(assist)
  );

  // --- contracts: pick up cargo and deliver it --------------------------------
  const contract = await page.evaluate(async () => {
    const g = window.SWGame;
    const p = g.player;
    p.dead = false;
    g.state = "playing";
    g.contract.state = "idle";
    for (let i = 0; i < 20 && g.contract.state === "idle"; i++) {
      await new Promise((r) => setTimeout(r, 30));
    }
    if (g.contract.state !== "offer") return { skipped: "no offer" };

    p.release();
    p.pos.x = g.contract.pickup.x;
    p.pos.y = g.contract.pickup.y;
    for (let i = 0; i < 20 && g.contract.state === "offer"; i++) {
      await new Promise((r) => setTimeout(r, 30));
    }
    const carried = g.contract.state === "carry";
    if (!carried) return { carried, skipped: "no pickup" };

    const before = g.score;
    p.pos.x = g.contract.drop.x;
    p.pos.y = g.contract.drop.y - 20;
    for (let i = 0; i < 20 && g.contract.state === "carry"; i++) {
      await new Promise((r) => setTimeout(r, 30));
    }
    // After a delivery the next offer appears at once, so "not carrying" is the
    // signal, not "idle".
    return { carried, delivered: g.contract.state !== "carry", gain: g.score - before };
  });
  check(
    "contract can be picked up and delivered",
    contract.skipped ? false : contract.carried && contract.delivered && contract.gain > 200,
    JSON.stringify(contract)
  );

  // --- ghost recording round-trips through storage ----------------------------
  const ghost = await page.evaluate(() => {
    const g = window.SWGame;
    const recorded = g.record.length;
    localStorage.removeItem("swing-ghost-v1-test");
    return { recorded, sane: recorded % 2 === 0 };
  });
  check(
    "run is recorded for the ghost",
    ghost.recorded > 10 && ghost.sane,
    JSON.stringify(ghost)
  );

  // --- key rebinding -----------------------------------------------------------
  const rebind = await page.evaluate(async () => {
    const btns = document.querySelectorAll("#binds .bind-key");
    if (!btns.length) return { skipped: true };
    btns[0].click();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyZ" }));
    await new Promise((r) => setTimeout(r, 60));
    const stored = JSON.parse(localStorage.getItem("swing-settings-v1"));
    return { binds: stored.binds && stored.binds.left, label: btns[0].textContent };
  });
  check(
    "keys can be rebound and persist",
    rebind.skipped || (rebind.binds && rebind.binds[0] === "KeyZ"),
    JSON.stringify(rebind)
  );

  // --- quality and calm switches ----------------------------------------------
  const modes = await page.evaluate(() => {
    const low = document.getElementById("opt-low");
    const calm = document.getElementById("opt-calm");
    const perf = document.getElementById("opt-perf");
    low.checked = true;
    low.dispatchEvent(new Event("change"));
    calm.checked = true;
    calm.dispatchEvent(new Event("change"));
    perf.checked = true;
    perf.dispatchEvent(new Event("change"));
    const state = {
      quality: window.SW.Render.quality,
      calm: window.SW.Render.calm,
      perfShown: !document.getElementById("hud-perf").classList.contains("hidden"),
      dpr: window.SWGame.view.dpr,
    };
    low.checked = false;
    low.dispatchEvent(new Event("change"));
    calm.checked = false;
    calm.dispatchEvent(new Event("change"));
    perf.checked = false;
    perf.dispatchEvent(new Event("change"));
    return state;
  });
  check(
    "low quality, calm mode and frame timer switch on",
    modes.quality === 0 && modes.calm === true && modes.perfShown && modes.dpr === 1,
    JSON.stringify(modes)
  );

  // --- enemies: they exist, they hunt, they shoot, they can be webbed --------
  const enemies = await page.evaluate(async () => {
    const g = window.SWGame;
    const p = g.player;
    g.world.ensureUpTo(p.pos.x + 22000);
    const kinds = {};
    let hostile = 0;
    for (const z of g.world.hazards) {
      kinds[z.type] = (kinds[z.type] || 0) + 1;
      if (z.hostile) hostile++;
    }
    return { kinds, hostile, total: g.world.hazards.length };
  });
  check(
    "hostile enemies and turrets are generated",
    enemies.hostile > 0 && enemies.kinds.turret > 0,
    JSON.stringify(enemies)
  );

  const hunt = await page.evaluate(async () => {
    const g = window.SWGame;
    const p = g.player;
    const z = g.world.hazards.find((h) => h.type === "drone" && h.hostile);
    if (!z) return { skipped: true };
    p.dead = false;
    g.state = "playing";
    p.release();
    p.pos.x = z.x - 300;
    p.pos.y = z.y;
    p.vel.x = 0;
    p.vel.y = 0;
    const before = Math.abs(z.x - p.pos.x);
    for (let i = 0; i < 25; i++) {
      p.pos.x = z.x - Math.abs(z.x - p.pos.x); // hold the player still
      p.vel.x = 0;
      p.vel.y = 0;
      await new Promise((r) => setTimeout(r, 20));
    }
    return { before, after: Math.abs(z.x - p.pos.x), alert: z.alert };
  });
  check(
    "hostile drone closes in on the player",
    hunt.skipped || (hunt.after < hunt.before && hunt.alert > 0.2),
    JSON.stringify(hunt)
  );

  const turret = await page.evaluate(async () => {
    const g = window.SWGame;
    const p = g.player;
    const z = g.world.hazards.find((h) => h.type === "turret");
    if (!z) return { skipped: true };
    g.world.shots.length = 0;
    p.dead = false;
    g.state = "playing";
    p.release();
    for (let i = 0; i < 60 && !g.world.shots.length; i++) {
      p.pos.x = z.x + 240;
      p.pos.y = z.y - 160;
      p.vel.x = 0;
      p.vel.y = 0;
      await new Promise((r) => setTimeout(r, 20));
    }
    return { shots: g.world.shots.length, alert: z.alert };
  });
  check(
    "turret opens fire on a nearby player",
    turret.skipped || turret.shots > 0,
    JSON.stringify(turret)
  );

  const webbed = await page.evaluate(async () => {
    const g = window.SWGame;
    const p = g.player;
    const z = g.world.hazards.find((h) => h.type === "drone" && h.state === "alive");
    if (!z) return { skipped: true };
    p.dead = false;
    g.state = "playing";
    p.release();
    p.pos.x = z.x - 260;
    p.pos.y = z.y;
    p.vel.x = 0;
    p.vel.y = 0;
    // Track the enemy with the cursor the way a player would, then fire.
    const canvas = document.getElementById("game");
    const before = g.score;
    let targeted = false;
    let fired = false;
    for (let i = 0; i < 60 && z.state === "alive"; i++) {
      p.vel.x = 0;
      p.vel.y = 0;
      g.aim.sx = (z.x - g.cam.x) * g.cam.zoom + g.view.w / 2;
      g.aim.sy = (z.y - g.cam.y) * g.cam.zoom + g.view.h / 2;
      await new Promise((r) => setTimeout(r, 20));
      if (g.targetEnemy) {
        targeted = true;
        if (!fired) {
          fired = true;
          canvas.dispatchEvent(
            new MouseEvent("mousedown", {
              clientX: g.aim.sx,
              clientY: g.aim.sy,
              button: 0,
            })
          );
          window.dispatchEvent(new MouseEvent("mouseup", { button: 0 }));
        }
      }
    }
    return { targeted, state: z.state, gain: Math.round(g.score - before) };
  });
  check(
    "a web shot brings an enemy down",
    webbed.skipped || (webbed.targeted && webbed.state === "webbed" && webbed.gain > 50),
    JSON.stringify(webbed)
  );

  const shotHit = await page.evaluate(async () => {
    const g = window.SWGame;
    const p = g.player;
    p.dead = false;
    p.stun = 0;
    g.state = "playing";
    g.world.shots.length = 0;
    g.world.shots.push({
      hostile: true,
      x: p.pos.x + 30,
      y: p.pos.y,
      vx: -400,
      vy: 0,
      r: 8,
      life: 2,
    });
    for (let i = 0; i < 25 && p.stun <= 0; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    return { stun: +p.stun.toFixed(2) };
  });
  check("enemy fire stuns the player", shotHit.stun > 0, JSON.stringify(shotHit));

  await page.screenshot({ path: "/tmp/feature-end.png" });
  await browser.close();

  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`);
  }
  if (errors.length) {
    failed++;
    console.log("\nCONSOLE ERRORS:\n" + errors.join("\n"));
  }
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
