/**
 * Headless smoke test: runs the real world/player code with an autopilot and
 * reports how far a naive swinger gets. Usage: node tools/sim.js [seconds]
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
      canvas: { width: 0, height: 0 },
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        return noop;
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    }
  );
}

global.window = global;
global.document = {
  createElement() {
    return { width: 0, height: 0, getContext: stubContext };
  },
};

const root = path.join(__dirname, "..", "src");
for (const file of ["util.js", "world.js", "player.js"]) {
  const code = fs.readFileSync(path.join(root, file), "utf8");
  new Function(code).call(global);
}

const SW = global.SW;
const C = SW.CONST;

function run(seed, seconds) {
  const world = new SW.World(seed);
  world.reset(seed);
  const player = new SW.Player();
  const pad = world.buildings[0];
  player.reset(pad.x + pad.w * 0.5, pad.top - C.PLAYER_R - 40);

  const game = {
    reason: "",
    kill(reason) {
      game.reason = reason;
      if (process.env.TRACE) {
        console.log(
          `  kill ${reason} at t=${t.toFixed(2)} pos=(${player.pos.x.toFixed(
            0
          )}, ${player.pos.y.toFixed(0)}) vel=(${player.vel.x.toFixed(
            0
          )}, ${player.vel.y.toFixed(0)}) web=${player.web}`
        );
      }
      player.dead = true;
    },
    onAttach() {},
    onLand() {},
    onJump() {},
    onScrape() {},
    onKick() {},
    onDash() {},
    onHazardHit() {},
  };

  const input = { moveX: 1, reel: 0, jump: false };
  const dt = 1 / 120;
  let shootCooldown = 0;
  let stuck = 0;
  let hold = 0;
  let orbs = 0;
  let t = 0;

  for (; t < seconds && !player.dead; t += dt) {
    shootCooldown -= dt;

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
      // A human would kick off the wall instead of hanging there.
      input.jump = stuck > 0.25 && player.canKick();
      if ((past && rising) || (hold > 1.4 && rising) || stuck > 0.4) {
        player.release();
        hold = 0;
        stuck = 0;
        shootCooldown = 0.04;
      }
    } else if (player.onWall) {
      stuck += dt;
      input.moveX = 0;
      input.reel = 1;
      input.jump = stuck > 0.3;
      if (input.jump) stuck = 0;
    } else if (shootCooldown <= 0 && (player.web === "none" || player.web === "miss")) {
      player.autoShoot(world);
      shootCooldown = 0.08;
      if (process.env.TRACE && player.web === "flying") {
        console.log(
          `  shoot t=${t.toFixed(2)} pos=(${player.pos.x.toFixed(
            0
          )}, ${player.pos.y.toFixed(0)}) -> anchor=(${player.anchor.x.toFixed(
            0
          )}, ${player.anchor.y.toFixed(0)})`
        );
      }
    }

    player.update(dt, input, world, game);

    if (process.env.TRACE && Math.abs(t % 2) < dt) {
      console.log(
        `  t=${t.toFixed(1)} pos=(${player.pos.x.toFixed(
          0
        )}, ${player.pos.y.toFixed(0)}) vel=(${player.vel.x.toFixed(
          0
        )}, ${player.vel.y.toFixed(0)}) web=${player.web} roof=${player.onRoof}`
      );
    }
    const hz = world.hazardAt(player.pos.x, player.pos.y, C.PLAYER_R);
    if (hz) player.hit(hz, game);
    world.clearance(player.pos.x, player.pos.y, C.PLAYER_R + C.GRAZE_DIST);
    world.update(dt, player.pos.x);
    world.ensureUpTo(player.pos.x + 3000);

    for (const o of world.orbs) {
      if (o.taken) continue;
      const dx = o.x - player.pos.x;
      const dy = o.y - player.pos.y;
      if (dx * dx + dy * dy < 35 * 35) {
        o.taken = true;
        orbs++;
      }
    }
  }

  return {
    seed,
    reason: game.reason,
    attachedAt: player.web,
    survived: +t.toFixed(1),
    dead: player.dead,
    distance: Math.round((player.pos.x - world.startX) / C.PIXELS_PER_METER),
    orbs,
    buildings: world.buildings.length,
  };
}

const seconds = Number(process.argv[2] || 60);
let alive = 0;
for (let i = 0; i < 8; i++) {
  const r = run(1000 + i * 7919, seconds);
  if (!r.dead) alive++;
  console.log(
    `seed ${r.seed}\tt=${r.survived}s\t${r.dead ? "CRASH" : "alive"}\t` +
      `${r.distance} m\torbs ${r.orbs}\t${r.reason}`
  );
}
console.log(`\nsurvived full ${seconds}s: ${alive}/8`);
