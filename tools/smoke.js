/**
 * Browser smoke test: loads the page in headless Chrome, plays a scripted run
 * and fails on any console error or uncaught exception.
 * Usage: node tools/smoke.js [url]
 */
const puppeteer = require("puppeteer-core");

const URL = process.argv[2] || "http://localhost:8000/index.html";

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,720"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const problems = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push("console: " + m.text());
  });
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));

  await page.goto(URL, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 600));

  await page.screenshot({ path: "/tmp/shot-menu.png" });

  await page.click("#btn-play");
  await new Promise((r) => setTimeout(r, 400));

  // Scripted play: aim ahead-up, hold the web, release, repeat.
  for (let i = 0; i < 14; i++) {
    await page.mouse.move(880, 190);
    await page.mouse.down();
    await new Promise((r) => setTimeout(r, 420));
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 260));
    if (i === 3) await page.screenshot({ path: "/tmp/shot-swing.png" });
  }

  // Wall push-off: drop the hero onto a facade, then kick with Space.
  const kick = await page.evaluate(async () => {
    const g = window.SWGame;
    const p = g.player;
    // Pick a facade with no crane, sign or neighbour in the way.
    const clear = (x, y, self) =>
      !g.world.boxes.some(
        (box) =>
          box.hard &&
          box !== self &&
          x > box.x - 70 &&
          x < box.x + box.w + 70 &&
          y > box.y - 70 &&
          y < box.y + box.h + 70
      );
    let b = null;
    for (const q of g.world.buildings) {
      if (q.h < 340 || q.x < p.pos.x + 400) continue;
      const self = g.world.boxes.find((s) => s.x === q.x && s.y === q.top);
      if (clear(q.x - 15, q.top + 140, self)) {
        b = q;
        break;
      }
    }
    if (!b) return { skipped: true };

    p.dead = false;
    g.state = "playing";
    p.release();
    p.pos.x = b.x - 15;
    p.pos.y = b.top + 140;
    p.vel.x = 260;
    p.vel.y = 0;

    // Wait for the grip instead of guessing a delay, then read the kick on the
    // very next frames: later readings pick up the next collision instead.
    let clinging = false;
    for (let i = 0; i < 40 && !clinging; i++) {
      await new Promise((r) => setTimeout(r, 20));
      clinging = p.onWall;
    }
    const before = { x: p.vel.x, y: p.vel.y };
    const nx = p.wallNx;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    await new Promise((r) => setTimeout(r, 24));
    const after0 = { x: Math.round(p.vel.x), y: Math.round(p.vel.y) };
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
    return {
      clinging,
      wallNormal: nx,
      before,
      after: after0,
    };
  });

  if (!kick.skipped) {
    if (!kick.clinging) problems.push("player did not cling to the facade");
    if (kick.after.x * kick.wallNormal <= 0) {
      problems.push("kick did not push away from the wall: " + JSON.stringify(kick));
    }
    if (kick.after.y >= 0) problems.push("kick had no upward component");
  }
  console.log("wall kick:", JSON.stringify(kick));

  const state = await page.evaluate(() => ({
    state: window.SWGame.state,
    distance: Math.floor(window.SWGame.distance),
    score: Math.floor(window.SWGame.score),
    x: Math.round(window.SWGame.player.pos.x),
    y: Math.round(window.SWGame.player.pos.y),
    buildings: window.SWGame.world.buildings.length,
    fps: window.SWGame.time,
  }));
  await page.screenshot({ path: "/tmp/shot-end.png" });

  console.log(JSON.stringify(state, null, 2));
  await browser.close();

  if (problems.length) {
    console.log("\nPROBLEMS:\n" + problems.join("\n"));
    process.exit(1);
  }
  console.log("\nno console errors");
})();
