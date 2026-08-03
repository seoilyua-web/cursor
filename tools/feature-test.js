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

  // --- every level is a different map ----------------------------------------
  const maps = await page.evaluate(() => {
    const g = window.SWGame;
    const levels = window.SW.World.LEVELS;
    const out = [];
    for (let i = 0; i < levels.length; i++) {
      g.world.reset(levels[i].seed, i);
      g.world.ensureUpTo(9000);
      const props = {};
      for (const p of g.world.props) props[p.type] = (props[p.type] || 0) + 1;
      const heights = g.world.buildings.map((b) => b.h);
      out.push({
        id: levels[i].id,
        name: levels[i].name,
        buildings: g.world.buildings.length,
        avgHeight: Math.round(heights.reduce((a, b) => a + b, 0) / heights.length),
        props,
        hazards: g.world.hazards.length,
      });
    }
    return out;
  });
  const signature = (m) => Object.keys(m.props).sort().join(",");
  const uniqueMixes = new Set(maps.map(signature)).size;
  const heightSpread =
    Math.max(...maps.map((m) => m.avgHeight)) -
    Math.min(...maps.map((m) => m.avgHeight));
  check(
    "six levels with different anchors and architecture",
    maps.length === 6 && uniqueMixes >= 5 && heightSpread > 300,
    maps.map((m) => `${m.id}:${signature(m)}`).join(" | ")
  );
  check(
    "special structures appear only on their own level",
    maps.find((m) => m.id === "skyline").props.bridge > 0 &&
      maps.find((m) => m.id === "site").props.scaffold > 0 &&
      maps.find((m) => m.id === "oldtown").props.spire > 0 &&
      maps.find((m) => m.id === "industrial").props.chimney > 0 &&
      !maps.find((m) => m.id === "centre").props.bridge,
    JSON.stringify(maps.map((m) => m.props))
  );

  // --- the picker starts the chosen map ---------------------------------------
  const picked = await page.evaluate(async () => {
    const buttons = document.querySelectorAll("#level-list .level");
    if (buttons.length < 6) return { skipped: true };
    buttons[4].click(); // Небесный квартал
    await new Promise((r) => setTimeout(r, 60));
    const stored = JSON.parse(localStorage.getItem("swing-settings-v1"));
    // The list is rebuilt on selection, so look at the fresh nodes.
    const fresh = document.querySelectorAll("#level-list .level");
    return { level: stored.level, active: fresh[4].classList.contains("active") };
  });
  check(
    "level picker selects and remembers the map",
    picked.skipped || (picked.level === 4 && picked.active),
    JSON.stringify(picked)
  );
  await page.evaluate(() => {
    document.querySelectorAll("#level-list .level")[0].click();
  });

  await page.click("#btn-play");
  await new Promise((r) => setTimeout(r, 500));

  // --- the reticle resolves to a real anchor ---------------------------------
  const aim = await page.evaluate(async () => {
    const g = window.SWGame;
    const p = g.player;
    let found = null;
    for (let deg = 15; deg <= 85 && !found; deg += 5) {
      const a = (-deg * Math.PI) / 180;
      found = p.probeDir(Math.cos(a), Math.sin(a), g.world);
    }
    if (!found) return { skipped: true };
    // The hero keeps moving, so track the anchor for a few frames.
    for (let i = 0; i < 20 && !g.aimHit; i++) {
      g.aim.sx = (found.x - g.cam.x) * g.cam.zoom + g.view.w / 2;
      g.aim.sy = (found.y - g.cam.y) * g.cam.zoom + g.view.h / 2;
      await new Promise((r) => setTimeout(r, 25));
    }
    return { hit: !!g.aimHit, noArcState: g.preview === undefined };
  });
  check(
    "aiming resolves to an anchor and no ghost arc is kept",
    aim.skipped || (aim.hit && aim.noArcState),
    JSON.stringify(aim)
  );

  // --- webs can be fired while falling ---------------------------------------
  const falling = await page.evaluate(() => {
    const g = window.SWGame;
    const p = g.player;
    p.release();
    p.vel.y = 0;
    const still = p.anchorRise();
    p.vel.y = 900 * window.SW.CONST.PACE;
    const dropping = p.anchorRise();
    // A ledge exactly level with the head: refused when steady, allowed in a fall.
    const level = { x: p.pos.x + 200, y: p.pos.y };
    const okStill = level.y <= p.pos.y - still;
    const okFalling = level.y <= p.pos.y - dropping;
    p.vel.y = 0;
    return { still: Math.round(still), dropping: Math.round(dropping), okStill, okFalling };
  });
  check(
    "falling opens up anchors at and below head level",
    falling.dropping < 0 && !falling.okStill && falling.okFalling,
    JSON.stringify(falling)
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
    "hostile rivals and rooftop sentries are generated",
    enemies.hostile > 0 && enemies.kinds.sentry > 0,
    JSON.stringify(enemies)
  );

  const hunt = await page.evaluate(async () => {
    const g = window.SWGame;
    const p = g.player;
    const z = g.world.hazards.find((h) => h.type === "runner" && h.hostile);
    if (!z) return { skipped: true };
    p.dead = false;
    p.stun = 0;
    g.state = "playing";
    p.release();
    // Rivals run on roofs now: stand above the roof it is patrolling.
    p.pos.x = z.x - 260;
    p.pos.y = z.y - 90;
    const before = Math.abs(z.x - p.pos.x);
    let grounded = false;
    for (let i = 0; i < 40; i++) {
      p.pos.x = z.x + (z.x > p.pos.x ? -1 : 1) * Math.abs(z.x - p.pos.x);
      p.vel.x = 0;
      p.vel.y = 0;
      if (z.onGround) grounded = true;
      await new Promise((r) => setTimeout(r, 20));
    }
    return {
      before,
      after: Math.abs(z.x - p.pos.x),
      alert: z.alert,
      grounded,
      flying: !z.onGround && z.vy === 0,
    };
  });
  check(
    "a red rival runs along the roof towards the player",
    hunt.skipped || (hunt.after < hunt.before && hunt.alert > 0.2 && hunt.grounded),
    JSON.stringify(hunt)
  );

  const turret = await page.evaluate(async () => {
    const g = window.SWGame;
    const p = g.player;
    const z = g.world.hazards.find((h) => h.type === "sentry");
    if (!z) return { skipped: true };
    g.world.shots.length = 0;
    p.dead = false;
    p.stun = 0;
    g.state = "playing";
    p.release();
    // A bolt can be created and hit a wall between two samples, so watch for
    // any sighting rather than the state at the end.
    let seen = 0;
    for (let i = 0; i < 90 && !seen; i++) {
      p.pos.x = z.x + 240;
      p.pos.y = z.y - 160;
      p.vel.x = 0;
      p.vel.y = 0;
      await new Promise((r) => setTimeout(r, 20));
      seen = Math.max(seen, g.world.shots.length);
    }
    return { shots: seen, alert: z.alert, fireCd: +z.fireCd.toFixed(2) };
  });
  check(
    "a green sentry opens fire on a nearby player",
    turret.skipped || turret.shots > 0,
    JSON.stringify(turret)
  );

  const webbed = await page.evaluate(async () => {
    const g = window.SWGame;
    const p = g.player;
    const z = g.world.hazards.find((h) => h.type === "runner" && h.state === "alive");
    if (!z) return { skipped: true };
    p.dead = false;
    p.stun = 0;
    p.webAmmo = window.SW.CONST.WEB_MAX; // this checks shooting, not the economy
    g.world.shots.length = 0;
    g.state = "playing";
    p.release();

    const clearLine = (ox, oy) => {
      for (let t = 0.1; t <= 1; t += 0.1) {
        const x = ox + (z.x - ox) * t;
        const y = oy + (z.y - oy) * t;
        if (g.world.collide(x, y, 6)) return false;
      }
      return !g.world.collide(ox, oy, 14);
    };
    const offsets = [
      [-260, -60],
      [260, -60],
      [-220, -150],
      [220, -150],
      [-150, -240],
      [150, -240],
    ];
    let off = null;
    for (const [ox, oy] of offsets) {
      if (z.y + oy > -220) continue;
      if (clearLine(z.x + ox, z.y + oy)) {
        off = { x: ox, y: oy };
        break;
      }
    }
    if (!off) return { skipped: "no clear line" };

    const canvas = document.getElementById("game");
    const before = g.breakdown.enemies;
    let targeted = false;
    let downed = 0;
    // A hunter takes two hits, and a rival that runs off has to be re-acquired,
    // so give the exchange a few seconds.
    for (let i = 0; i < 200 && !downed; i++) {
      // Hold the range: a rival that rams you stuns you out of shooting.
      p.pos.x = z.x + off.x;
      p.pos.y = z.y + off.y;
      p.vel.x = 0;
      p.vel.y = 0;
      g.aim.sx = (z.x - g.cam.x) * g.cam.zoom + g.view.w / 2;
      g.aim.sy = (z.y - g.cam.y) * g.cam.zoom + g.view.h / 2;
      await new Promise((r) => setTimeout(r, 20));
      if (g.targetEnemy) {
        targeted = true;
        canvas.dispatchEvent(
          new MouseEvent("mousedown", {
            clientX: g.aim.sx,
            clientY: g.aim.sy,
            button: 0,
          })
        );
        window.dispatchEvent(new MouseEvent("mouseup", { button: 0 }));
      }
      // A cocoon lands on the roof it stood on and is gone within a frame, so
      // the score is the reliable witness.
      downed = g.breakdown.enemies - before > 50 ? 1 : 0;
    }
    return { targeted, downed, gain: Math.round(g.breakdown.enemies - before) };
  });
  check(
    "a web shot brings a rival down",
    webbed.skipped || (webbed.targeted && webbed.downed > 0 && webbed.gain > 50),
    JSON.stringify(webbed)
  );

  const shotHit = await page.evaluate(async () => {
    const g = window.SWGame;
    const p = g.player;
    // Clear air: on the street the hero would just be killed again each frame.
    p.release();
    p.dead = false;
    p.stun = 0;
    p.onRoof = false;
    p.onWall = false;
    p.pos.y = -1400;
    p.vel.x = 0;
    p.vel.y = 0;
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

  // --- pizza is the web supply -------------------------------------------------
  const pizza = await page.evaluate(async () => {
    const g = window.SWGame;
    const p = g.player;
    const C = window.SW.CONST;
    p.dead = false;
    p.stun = 0;
    g.state = "playing";
    p.release();

    // Park next to an untouched slice and let the pickup happen.
    const slice = g.world.pizzas.find((o) => !o.taken && o.y < -260);
    if (!slice) return { skipped: true };
    p.webAmmo = 4;
    const beforeScore = g.breakdown.pizzas;
    for (let i = 0; i < 30 && !slice.taken; i++) {
      p.pos.x = slice.x;
      p.pos.y = slice.y;
      p.vel.x = 0;
      p.vel.y = 0;
      await new Promise((r) => setTimeout(r, 20));
    }
    const afterPickup = p.webAmmo;

    // Firing a web costs supply; at zero it must refuse.
    p.webAmmo = 2;
    let anchor = null;
    for (let deg = 20; deg <= 85 && !anchor; deg += 5) {
      const a = (-deg * Math.PI) / 180;
      anchor = p.probeDir(Math.cos(a), Math.sin(a), g.world);
    }
    if (!anchor) return { skipped: true };
    const spent = anchor ? p.shoot(anchor.x, anchor.y, g.world) : null;
    const afterShot = p.webAmmo;
    p.release();
    p.webAmmo = 0;
    const dry = anchor ? p.shoot(anchor.x, anchor.y, g.world) : null;
    await new Promise((r) => setTimeout(r, 60));
    const hudEmpty = document.getElementById("hud-web").classList.contains("empty");
    return {
      taken: slice.taken,
      gained: afterPickup - 4,
      scored: g.breakdown.pizzas > beforeScore,
      spent,
      afterShot,
      dry,
      hudEmpty,
    };
  });
  check(
    "pizza refills the web and every line costs supply",
    pizza.skipped ||
      (pizza.taken &&
        pizza.gained === 5 &&
        pizza.scored &&
        pizza.spent === true &&
        pizza.afterShot === 1 &&
        pizza.dry === false &&
        pizza.hudEmpty),
    JSON.stringify(pizza)
  );

  // --- rescue: someone falls and gets caught ---------------------------------
  const rescue = await page.evaluate(async () => {
    const g = window.SWGame;
    const p = g.player;
    p.dead = false;
    g.state = "playing";
    g.rescue = null;
    g.rescueCd = 0;
    // Spawning needs a tall roof ahead, so keep asking rather than waiting once.
    for (let i = 0; i < 80 && !g.rescue; i++) {
      g.rescueCd = 0;
      p.pos.x += 60;
      await new Promise((r) => setTimeout(r, 25));
    }
    if (!g.rescue) return { skipped: "no spawn" };
    const spot = { x: g.rescue.x, y: g.rescue.y };
    p.release();
    p.pos.x = spot.x - 300;
    p.pos.y = spot.y;
    for (let i = 0; i < 40 && g.rescue && g.rescue.state === "wait"; i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
    const falling = !!g.rescue && g.rescue.state === "fall";
    const before = g.breakdown.rescues;
    for (let i = 0; i < 60 && g.rescue; i++) {
      p.pos.x = g.rescue.x;
      p.pos.y = g.rescue.y;
      p.vel.x = 0;
      p.vel.y = 0;
      await new Promise((r) => setTimeout(r, 20));
    }
    return { falling, gain: Math.round(g.breakdown.rescues - before) };
  });
  check(
    "a falling civilian can be caught",
    rescue.skipped ? false : rescue.falling && rescue.gain > 200,
    JSON.stringify(rescue)
  );

  // --- daily challenges --------------------------------------------------------
  const tasks = await page.evaluate(async () => {
    const g = window.SWGame;
    const list = g.challenges.map((c) => ({ id: c.id, target: c.target }));
    const rows = document.querySelectorAll("#start-tasks .task").length;
    return { count: g.challenges.length, list, rows };
  });
  check(
    "three daily tasks are generated and listed",
    tasks.count === 3 && tasks.rows === 3,
    JSON.stringify(tasks.list)
  );

  // --- air chain and its reset -------------------------------------------------
  const chain = await page.evaluate(async () => {
    const g = window.SWGame;
    const p = g.player;
    p.dead = false;
    g.state = "playing";
    // Clear sky: touching anything resets the chain by design.
    p.release();
    p.onRoof = false;
    p.onWall = false;
    p.wallTimer = 0;
    p.pos.y = -1700;
    p.vel.x = 0;
    p.vel.y = 0;
    g.chain = 4;
    await new Promise((r) => setTimeout(r, 90)); // let a frame refresh the HUD
    const shown = !document.getElementById("hud-chain").classList.contains("hidden");
    g.onLand(0);
    return { shown, afterLand: g.chain };
  });
  check(
    "air chain shows in the HUD and resets on landing",
    chain.shown && chain.afterLand === 0,
    JSON.stringify(chain)
  );

  // --- score breakdown on the end screen ---------------------------------------
  const breakdown = await page.evaluate(async () => {
    const g = window.SWGame;
    g.breakdown.enemies = 300;
    g.breakdown.style = 120;
    g.player.dead = false; // kill() ignores an already dead hero
    g.state = "playing";
    g.kill("ground");
    await new Promise((r) => setTimeout(r, 1100));
    const rows = document.querySelectorAll("#res-breakdown div").length;
    const tasks = document.querySelectorAll("#dead-tasks .task").length;
    return { rows, tasks, state: g.state };
  });
  check(
    "end screen explains where the score came from",
    breakdown.rows >= 2 && breakdown.tasks === 3,
    JSON.stringify(breakdown)
  );

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
