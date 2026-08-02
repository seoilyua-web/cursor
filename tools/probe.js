/** Detailed single-run trace for tuning. Usage: node tools/probe.js [seed] [sec] */
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
const seed = Number(process.argv[2] || 1000);
const seconds = Number(process.argv[3] || 12);

const world = new SW.World(seed);
world.reset(seed);
const player = new SW.Player();
const pad = world.buildings[0];
player.reset(pad.x + pad.w * 0.5, pad.top - C.PLAYER_R - 40);

const game = {
  kill(r) {
    console.log(`KILL ${r} t=${t.toFixed(2)}`);
    player.dead = true;
  },
  onAttach() {},
  onLand() {},
  onJump() {},
  onScrape() {},
};

const input = { moveX: 1, reel: 0, jump: false };
const dt = 1 / 120;
let t = 0;
let shootCooldown = 0;
let stuck = 0;
let hold = 0;
let lastState = "";

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
    const before = player.web;
    player.autoShoot(world);
    shootCooldown = 0.08;
    if (player.web === "flying" && before !== "flying") {
      console.log(
        `  t=${t.toFixed(2)} ATTACH from (${player.pos.x.toFixed(
          0
        )}, ${player.pos.y.toFixed(0)}) v=(${player.vel.x.toFixed(
          0
        )}, ${player.vel.y.toFixed(0)}) -> (${player.anchor.x.toFixed(
          0
        )}, ${player.anchor.y.toFixed(0)}) rise=${(
        player.pos.y - player.anchor.y
      ).toFixed(0)}`
      );
    }
  }

  const state = `${player.web}|${player.onWall}|${player.onRoof}`;
  if (state !== lastState) {
    lastState = state;
  }

  player.update(dt, input, world, game);
  world.ensureUpTo(player.pos.x + 3000);

  if (process.env.DENSE ? t > Number(process.env.T0 || 0) && t < Number(process.env.T1 || 1e9) && Math.abs(t % 0.1) < dt : Math.abs(t % 3) < dt) {
    console.log(
      `    t=${t.toFixed(1)} pos=(${player.pos.x.toFixed(0)}, ${player.pos.y.toFixed(0)}) v=(${player.vel.x.toFixed(0)}, ${player.vel.y.toFixed(0)}) web=${player.web} wall=${player.onWall} roof=${player.onRoof} rope=${player.ropeLen.toFixed(0)} hold=${hold.toFixed(2)}`
    );
  }
}

console.log(
  `end t=${t.toFixed(1)} x=${player.pos.x.toFixed(0)} dist=${Math.round(
    (player.pos.x - world.startX) / C.PIXELS_PER_METER
  )} m`
);
