/**
 * Physics-level checks for the skill layer: perfect release, the zip, nets and
 * using a cocooned enemy as an anchor. Usage: node tools/skill-test.js
 */
const fs = require("fs");
const path = require("path");

function stubContext() {
  const gradient = { addColorStop() {} };
  const noop = () => {};
  return new Proxy(
    { createLinearGradient: () => gradient, createRadialGradient: () => gradient },
    { get: (t, p) => (p in t ? t[p] : noop), set: () => true }
  );
}

global.window = global;
global.document = {
  createElement: () => ({ width: 0, height: 0, getContext: stubContext }),
};

const root = path.join(__dirname, "..", "src");
for (const f of ["util.js", "world.js", "player.js"]) {
  new Function(fs.readFileSync(path.join(root, f), "utf8")).call(global);
}

const SW = global.SW;
const C = SW.CONST;
const dt = 1 / 120;

const game = {
  kill() {},
  onAttach() {},
  onLand() {},
  onJump() {},
  onScrape() {},
  onKick() {},
  onDash() {},
  onHazardHit() {},
  onSnared() {},
  onTetherBreak() {},
};

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
}

/** Bare arena: swing physics with no city in the way. */
function emptyWorld() {
  return {
    weather: { wind: 0, rain: 0, fog: 0 },
    collide: () => null,
    collidePlayer: () => null,
    roofUnder: () => null,
    clearBelow: () => 4000,
    raycast: () => null,
    softAt: () => null,
  };
}

function makeWorld(seed) {
  const w = new SW.World(seed);
  w.reset(seed);
  w.hazardsOn = false;
  w.ensureUpTo(9000);
  return w;
}

/** Hang a swing off a fixed anchor in open air and run it. */
function swing(world, anchorY, hold, input) {
  const p = new SW.Player();
  const ax = 3000;
  const ay = anchorY;
  p.reset(ax - 380, ay + 240);
  p.vel.x = 700 * C.PACE;
  p.vel.y = 0;
  p.anchor.x = ax;
  p.anchor.y = ay;
  p.web = "attached";
  p.ropeLen = Math.hypot(p.pos.x - ax, p.pos.y - ay);
  p.ropeTarget = p.ropeLen;
  p.swingTime = 0;
  p.bottomAt = -1;

  const io = Object.assign({ moveX: 0, reel: 0, jump: false, zip: false }, input);
  let t = 0;
  while (t < hold && p.web === "attached") {
    p.update(dt, io, world, game);
    t += dt;
  }
  return p;
}

// --- perfect release ---------------------------------------------------------
{
  const world = emptyWorld();
  // Run until the swing bottoms out, then let go on that very frame.
  const p = new SW.Player();
  const ax = 3000;
  const ay = -900;
  p.reset(ax - 380, ay + 240);
  p.vel.x = 700 * C.PACE;
  p.vel.y = 0;
  p.anchor.x = ax;
  p.anchor.y = ay;
  p.web = "attached";
  p.ropeLen = Math.hypot(p.pos.x - ax, p.pos.y - ay);
  p.ropeTarget = p.ropeLen;
  const io = { moveX: 0, reel: 0, jump: false, zip: false };
  let guard = 0;
  while (p.bottomAt < 0 && guard++ < 1200) p.update(dt, io, world, game);
  const speedBefore = p.speed();
  const bottomFound = p.bottomAt >= 0;
  const bottomAt = p.bottomAt;
  p.release();
  check(
    "release at the bottom of the arc counts as perfect",
    bottomFound && p.releasePerfect && p.speed() > speedBefore,
    `bottom=${bottomAt.toFixed(2)}s boost=${(p.speed() / speedBefore).toFixed(3)}`
  );
}

{
  const world = emptyWorld();
  const p = swing(world, -900, 0.1, {});
  p.release();
  check(
    "letting go early is not perfect",
    !p.releasePerfect,
    `bottomAt=${p.bottomAt.toFixed(2)}`
  );
}

// --- zip ---------------------------------------------------------------------
{
  const world = emptyWorld();
  const plain = swing(world, -900, 0.5, {});
  const zipped = swing(emptyWorld(), -900, 0.5, { zip: true });
  check(
    "zip hauls the hero up the line faster than reeling",
    zipped.ropeLen < plain.ropeLen - 40,
    `rope ${plain.ropeLen.toFixed(0)} -> ${zipped.ropeLen.toFixed(0)}`
  );
}

// --- net and breaking free ----------------------------------------------------
{
  const world = makeWorld(77);
  const p = new SW.Player();
  p.reset(3000, -700);
  p.vel.x = 600 * C.PACE;
  p.vel.y = 0;
  const netter = { x: 3120, y: -820, state: "alive" };
  p.snare({ x: netter.x, y: netter.y, obj: netter }, game);
  const io = { moveX: 0, reel: 0, jump: false, zip: false };
  const vyBefore = p.vel.y;
  for (let i = 0; i < 30; i++) p.update(dt, io, world, game);
  const pulled = p.vel.y > vyBefore;
  const blocked = p.shoot(p.pos.x + 300, p.pos.y - 300, world) === false;
  p.dashCd = 0;
  p.dash(p.pos.x + 300, p.pos.y - 300, game);
  check(
    "a net drags the hero down, blocks webs and breaks on a dash",
    pulled && blocked && !p.tether,
    `pulled=${pulled} blocked=${blocked}`
  );
}

// --- cocoon as an anchor ------------------------------------------------------
{
  const world = makeWorld(77);
  world.hazardsOn = true;
  // Find a patch of empty sky with a clear line from where the hero will hang:
  // blimps, balloons and masts all answer along the way.
  const clearShot = (ex, ey) => {
    for (let t = 0; t <= 1; t += 0.05) {
      const x = ex - 240 + 240 * t;
      const y = ey + 120 - 120 * t;
      if (world.softAt(x, y) || world.collide(x, y, 14)) return false;
    }
    return true;
  };
  let spotY = -1500;
  for (let y = -1500; y > -2800; y -= 40) {
    if (clearShot(3000, y)) {
      spotY = y;
      break;
    }
  }
  const enemy = {
    type: "runner",
    color: "red",
    x: 3000,
    y: spotY,
    baseY: spotY,
    r: 15,
    vx: 0,
    phase: 0,
    hostile: false,
    contact: true,
    state: "alive",
    hp: 1,
    fireCd: 0,
    alert: 0,
    fall: 0,
  };
  world.hazards.push(enemy);
  const beforeWeb = world.softAt(enemy.x, enemy.y);
  world.webEnemy(enemy);
  const afterWeb = world.softAt(enemy.x, enemy.y);

  const p = new SW.Player();
  p.reset(enemy.x - 240, enemy.y + 120);
  p.vel.x = 500 * C.PACE;
  const hit = p.probe(enemy.x, enemy.y, world);
  check(
    "a cocooned enemy becomes a web anchor that moves with it",
    !beforeWeb && afterWeb === enemy && hit && hit.obj === enemy,
    `before=${!!beforeWeb} after=${afterWeb === enemy} anchorObj=${hit && !!hit.obj}`
  );
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
