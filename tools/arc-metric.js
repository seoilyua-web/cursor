/**
 * Swing quality benchmark. Two numbers matter:
 *
 *   bottom%  — how often a held web actually reaches the bottom of its arc,
 *              i.e. how often the pendulum does its job instead of meeting a wall
 *   spread   — how much the autopilot's distance varies between seeds, i.e. how
 *              much of a run depends on lucky city layout rather than skill
 *
 * Usage: node tools/arc-metric.js [seeds] [seconds]
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

// ---------------------------------------------------------------------------
// Arc quality: sample open-air positions and shoot the way the game does
// ---------------------------------------------------------------------------

function arcQuality(seeds) {
  const out = [];
  const stats = { total: 0, bottom: 0, wall: 0, land: 0, ground: 0, time: 0 };
  const lens = [];
  for (const seed of seeds) {
    const w = new SW.World(seed);
    w.reset(seed);
    w.ensureUpTo(18000);
    const p = new SW.Player();
    for (let x = 700; x < 15000; x += 113) {
      for (const alt of [220, 380, 560, 760]) {
        p.pos.x = x;
        p.pos.y = -alt;
        p.vel.x = 950 * C.PACE;
        p.vel.y = 260 * C.PACE;
        p.web = "none";
        if (w.clearance(p.pos.x, p.pos.y, 90).dist < 70) continue;

        // Aim forward-and-up the way a player would, then let the game pick.
        const hit = p.aimAssist
          ? p.aimAssist(p.pos.x + 420, p.pos.y - 300, w)
          : p.probe(p.pos.x + 420, p.pos.y - 300, w);
        if (!hit) continue;

        p.predict(hit.x, hit.y, w, out);
        stats.total++;
        stats[out.stop]++;
        if (out.release) stats.bottom++;
        lens.push(out.length);
      }
    }
  }
  lens.sort((a, b) => a - b);
  const q = (f) => lens[Math.floor(lens.length * f)] || 0;
  return {
    total: stats.total,
    bottomPct: (100 * stats.bottom) / stats.total,
    stops: {
      wall: stats.wall,
      land: stats.land,
      ground: stats.ground,
      time: stats.time,
    },
    len: { p25: q(0.25), median: q(0.5), p75: q(0.75) },
  };
}

// ---------------------------------------------------------------------------
// Autopilot spread: same policy as tools/sim.js, reported as a distribution
// ---------------------------------------------------------------------------

const noopGame = {
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

function fly(seed, seconds) {
  const world = new SW.World(seed);
  world.reset(seed);
  world.hazardsOn = false; // measure geometry, not luck with helicopters
  const player = new SW.Player();
  const pad = world.buildings[0];
  player.reset(pad.x + pad.w * 0.5, pad.top - C.PLAYER_R - 40);
  const game = Object.assign({ dead: false }, noopGame, {
    kill() {
      player.dead = true;
    },
  });

  const input = { moveX: 1, reel: 0, jump: false, zip: false };
  const dt = 1 / 120;
  let shootCd = 0;
  let stuck = 0;
  let hold = 0;

  for (let t = 0; t < seconds && !player.dead; t += dt) {
    shootCd -= dt;
    if (player.onRoof) {
      input.jump = true;
      input.moveX = 1;
      input.reel = 0;
      stuck = 0;
    } else if (player.web === "attached") {
      hold += dt;
      input.moveX = 1;
      input.reel = player.pos.x < player.anchor.x ? 1 : 0;
      const past = player.pos.x > player.anchor.x - 20;
      const rising = player.vel.y < -60 * C.PACE;
      stuck = player.speed() < 150 * C.PACE ? stuck + dt : 0;
      input.jump = stuck > 0.25 && player.canKick();
      if ((past && rising) || (hold > 1.4 && rising) || stuck > 0.4) {
        player.release();
        hold = 0;
        stuck = 0;
        shootCd = 0.04;
      }
    } else if (player.onWall) {
      stuck += dt;
      input.moveX = 0;
      input.reel = 1;
      input.jump = stuck > 0.3;
      if (input.jump) stuck = 0;
    } else if (shootCd <= 0 && (player.web === "none" || player.web === "miss")) {
      if (player.aimAssist) {
        const hit = player.aimAssist(
          player.pos.x + 420,
          player.pos.y - 300,
          world
        );
        if (hit) player.shoot(hit.x, hit.y, world);
        else player.autoShoot(world);
      } else {
        player.autoShoot(world);
      }
      shootCd = 0.08;
      if (
        player.web !== "flying" &&
        player.altitude() < 260 &&
        player.vel.y > 0 &&
        player.canDash()
      ) {
        player.dash(player.pos.x + 400, player.pos.y - 320, game);
      }
    }
    player.update(dt, input, world, game);
    world.update(dt, player.pos.x, player.pos.y);
    world.ensureUpTo(player.pos.x + 3000);
  }
  return Math.round((player.pos.x - world.startX) / C.PIXELS_PER_METER);
}

const seedCount = Number(process.argv[2] || 12);
const seconds = Number(process.argv[3] || 45);
const seeds = [];
for (let i = 0; i < seedCount; i++) seeds.push(1000 + i * 7919);

const arc = arcQuality(seeds.slice(0, 4));
const dists = seeds.map((s) => fly(s, seconds)).sort((a, b) => a - b);
const q = (f) => dists[Math.floor(dists.length * f)];
const median = q(0.5) || 1;
const spread = (q(0.75) - q(0.25)) / Math.max(1, median);

console.log(`arcs sampled: ${arc.total}`);
console.log(`bottom of arc reached: ${arc.bottomPct.toFixed(1)}%   (target > 70)`);
console.log(`stops: ${JSON.stringify(arc.stops)}`);
console.log(`preview length p25/median/p75: ${arc.len.p25}/${arc.len.median}/${arc.len.p75}`);
console.log("");
console.log(`autopilot ${seconds}s over ${seedCount} seeds (m): ${dists.join(", ")}`);
console.log(
  `median ${median} m   p25 ${q(0.25)}   p75 ${q(0.75)}   spread ${spread.toFixed(2)} (target < 1.0)`
);
