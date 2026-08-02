/**
 * Physics test for wall grip and push-off, without a browser.
 * Usage: node tools/wall-test.js
 */
const fs = require("fs");
const path = require("path");

function stubContext() {
  const gradient = { addColorStop() {} };
  const noop = () => {};
  return new Proxy(
    {
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
    },
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
const noop = {
  kill() {},
  onAttach() {},
  onLand() {},
  onJump() {},
  onScrape() {},
  onKick() {},
};

function freeSpot(world, b, dyFromTop) {
  // Left facade of b, clear of cranes, signs and neighbours.
  const x = b.x - C.PLAYER_R - 2;
  const y = b.top + dyFromTop;
  for (const box of world.boxes) {
    if (!box.hard || box === null) continue;
    if (box.x === b.x && box.y === b.top) continue; // b itself
    if (
      x > box.x - 60 &&
      x < box.x + box.w + 60 &&
      y > box.y - 60 &&
      y < box.y + box.h + 60
    ) {
      return null;
    }
  }
  return { x, y };
}

function run(label, seed, action) {
  const world = new SW.World(seed);
  world.reset(seed);
  world.ensureUpTo(12000);
  const player = new SW.Player();

  let spot = null;
  let target = null;
  for (const b of world.buildings) {
    if (b.h < 340) continue;
    const s = freeSpot(world, b, 220);
    if (s) {
      spot = s;
      target = b;
      break;
    }
  }
  if (!spot) throw new Error("no clear facade found for seed " + seed);

  player.reset(spot.x, spot.y);
  player.vel.x = 240;
  player.vel.y = 0;
  const input = { moveX: 0, reel: 0, jump: false };

  let clingFrames = 0;
  let maxSlide = 0;
  for (let i = 0; i < 120; i++) {
    player.update(dt, input, world, noop);
    if (player.onWall) clingFrames++;
    if (player.onWall) maxSlide = Math.max(maxSlide, player.vel.y);
  }

  const beforeKick = { x: player.vel.x, y: player.vel.y, nx: player.wallNx };
  action(input, player);
  player.update(dt, input, world, noop);
  const after = { x: player.vel.x, y: player.vel.y };

  const ok =
    clingFrames > 100 &&
    maxSlide <= C.WALL_SLIDE + 1 &&
    after.x * beforeKick.nx > 0 &&
    after.y < 0;

  console.log(
    `${ok ? "PASS" : "FAIL"} ${label}` +
      ` cling=${clingFrames}/120 slide=${maxSlide.toFixed(0)}` +
      ` normal=${beforeKick.nx}` +
      ` kick=(${after.x.toFixed(0)}, ${after.y.toFixed(0)})`
  );
  return ok;
}

let ok = true;
ok = run("plain kick", 4242, (input) => (input.jump = true)) && ok;
ok =
  run("kick away (holding out)", 909, (input, p) => {
    input.jump = true;
    input.moveX = p.wallNx;
  }) && ok;
ok =
  run("kick up (holding in)", 31337, (input, p) => {
    input.jump = true;
    input.moveX = -p.wallNx;
  }) && ok;
ok =
  run("aimed kick", 777, (input, p) => {
    p.kickToward(p.pos.x + p.wallNx * 300, p.pos.y - 200, noop);
  }) && ok;

process.exit(ok ? 0 : 1);
