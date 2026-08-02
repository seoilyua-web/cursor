/**
 * Screenshot sweep for eyeballing generation, districts, weather and hazards.
 * Usage: node tools/shots.js [url]
 */
const puppeteer = require("puppeteer-core");

const URL = process.argv[2] || "http://localhost:8000/index.html";

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto(URL, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 500));

  await page.screenshot({ path: "/tmp/shot-menu.png" });
  await page.click("#btn-settings");
  await new Promise((r) => setTimeout(r, 350));
  await page.screenshot({ path: "/tmp/shot-settings.png" });
  await page.click("#btn-settings-close");
  await new Promise((r) => setTimeout(r, 250));

  await page.evaluate(() => {
    document.getElementById("overlay").classList.add("hidden");
  });

  // One frame per district, at its centre.
  const districts = await page.evaluate(() => window.SW.World.DISTRICTS.map((d) => d.id));
  const len = await page.evaluate(() => window.SW.World.DISTRICT_LEN);
  for (let i = 0; i < districts.length; i++) {
    const x = len * i + len * 0.5;
    await page.evaluate(
      (cx, rain) => {
        const g = window.SWGame;
        g.world.ensureUpTo(cx + 3600);
        g.cam.x = cx;
        g.cam.y = -520;
        g.cam.zoom = 0.75;
        g.world.weather.rain = rain;
        g.world.weather.wind = rain ? -0.6 : 0;
        g.world.weather.fog = rain ? 0.3 : 0;
      },
      x,
      i === 2 ? 0.9 : 0
    );
    await new Promise((r) => setTimeout(r, 260));
    await page.screenshot({ path: `/tmp/district-${districts[i]}.png` });
  }

  // A helicopter in frame.
  const heli = await page.evaluate(() => {
    const g = window.SWGame;
    const z = g.world.hazards.find((h) => h.type === "heli");
    if (!z) return null;
    g.cam.x = z.x;
    g.cam.y = z.y + 120;
    g.cam.zoom = 0.9;
    g.world.weather.rain = 0;
    g.world.weather.fog = 0;
    return { x: Math.round(z.x), y: Math.round(z.y) };
  });
  if (heli) {
    await new Promise((r) => setTimeout(r, 260));
    await page.screenshot({ path: "/tmp/heli.png" });
  }

  const counts = await page.evaluate(() => {
    const byType = {};
    for (const p of window.SWGame.world.props) byType[p.type] = (byType[p.type] || 0) + 1;
    const hz = {};
    for (const h of window.SWGame.world.hazards) hz[h.type] = (hz[h.type] || 0) + 1;
    return { props: byType, hazards: hz, boxes: window.SWGame.world.boxes.length };
  });
  console.log(JSON.stringify(counts, null, 2));
  await browser.close();
  if (problems.length) {
    console.log("PROBLEMS:\n" + problems.join("\n"));
    process.exit(1);
  }
})();
