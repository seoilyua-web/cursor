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
