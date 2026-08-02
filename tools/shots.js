/**
 * Screenshot sweep: walks the camera along the generated city and captures the
 * skyline so the props can be eyeballed. Usage: node tools/shots.js [url]
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

  await page.evaluate(() => {
    document.getElementById("overlay").classList.add("hidden");
  });

  for (let i = 0; i < 5; i++) {
    const x = 900 + i * 1500;
    await page.evaluate((cx) => {
      const g = window.SWGame;
      g.world.ensureUpTo(cx + 3600);
      g.cam.x = cx;
      g.cam.y = -520;
      g.cam.zoom = 0.75;
    }, x);
    await new Promise((r) => setTimeout(r, 250));
    await page.screenshot({ path: `/tmp/city-${i}.png` });
  }

  const counts = await page.evaluate(() => {
    const byType = {};
    for (const p of window.SWGame.world.props) {
      byType[p.type] = (byType[p.type] || 0) + 1;
    }
    return { props: byType, boxes: window.SWGame.world.boxes.length };
  });
  console.log(JSON.stringify(counts, null, 2));
  await browser.close();
  if (problems.length) {
    console.log("PROBLEMS:\n" + problems.join("\n"));
    process.exit(1);
  }
})();
