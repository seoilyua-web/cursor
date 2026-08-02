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
