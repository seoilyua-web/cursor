(function (global) {
  "use strict";

  var SW = (global.SW = global.SW || {});

  var TAU = Math.PI * 2;

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Frame-rate independent approach of `a` towards `b`. */
  function damp(a, b, lambda, dt) {
    return lerp(a, b, 1 - Math.exp(-lambda * dt));
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function Rng(seed) {
    this.next = mulberry32(seed);
  }
  Rng.prototype.range = function (a, b) {
    return a + this.next() * (b - a);
  };
  Rng.prototype.int = function (a, b) {
    return Math.floor(a + this.next() * (b - a + 1));
  };
  Rng.prototype.chance = function (p) {
    return this.next() < p;
  };
  Rng.prototype.pick = function (arr) {
    return arr[Math.floor(this.next() * arr.length)];
  };

  /** Cheap deterministic noise for background layers. */
  function hash01(i) {
    var x = Math.sin(i * 127.1) * 43758.5453;
    return x - Math.floor(x);
  }

  function mixHex(a, b, t) {
    var ar = parseInt(a.slice(1, 3), 16);
    var ag = parseInt(a.slice(3, 5), 16);
    var ab = parseInt(a.slice(5, 7), 16);
    var br = parseInt(b.slice(1, 3), 16);
    var bg = parseInt(b.slice(3, 5), 16);
    var bb = parseInt(b.slice(5, 7), 16);
    var r = Math.round(lerp(ar, br, t));
    var g = Math.round(lerp(ag, bg, t));
    var bl = Math.round(lerp(ab, bb, t));
    return "rgb(" + r + "," + g + "," + bl + ")";
  }

  SW.util = {
    TAU: TAU,
    clamp: clamp,
    lerp: lerp,
    damp: damp,
    mulberry32: mulberry32,
    Rng: Rng,
    hash01: hash01,
    mixHex: mixHex,
  };

  // ---------------------------------------------------------------------------
  // Tunables
  //
  // Values tagged A scale with PACE² (accelerations), V with PACE (velocities)
  // and the rest stay in pixels or seconds. Keeping the split explicit means the
  // pace slider never changes the shape of a trajectory, only its duration.
  // ---------------------------------------------------------------------------

  var BASE = {
    A: {
      GRAVITY: 2000,
      SWING_ACCEL: 1350,
      AIR_ACCEL: 780,
      RUN_ACCEL: 2600,
      WIND_MAX: 340,
      ZIP_ACCEL: 1500,
      TETHER_PULL: 820,
    },
    V: {
      REEL_SPEED: 500,
      AUTO_REEL: 300,
      PULL_SPEED: 1100,
      RUN_MAX: 620,
      JUMP_VELOCITY: 940,
      WALL_SLIDE: 150,
      WALL_CLIMB: 280,
      WALL_JUMP_X: 680,
      WALL_JUMP_Y: 900,
      MAX_SPEED: 2700,
      FATAL_IMPACT: 950,
      WEB_SPEED: 4200,
      LAUNCH_VX: 620,
      LAUNCH_VY: -320,
      KICK_POWER: 980,
      DASH_POWER: 1180,
      DRAG_FREE: 0.09,
      DRAG_ATTACHED: 0.035,
      HIT_KNOCKBACK: 620,
      WEB_SHOT_SPEED: 1500,
      ZIP_SPEED: 900,
      NET_SPEED: 300,
      ENEMY_JUMP: 620,
    },
    FIXED: {
      MAX_ROPE: 560,
      MIN_ROPE: 80,
      PLAYER_R: 13,
      WEB_RANGE: 580,
      MIN_ANCHOR_RISE: 45,
      FALL_ANCHOR_DROP: 210,
      ANCHOR_CLEARANCE: 60,
      AIM_ASSIST_ARC: 0.3,
      PIXELS_PER_METER: 10,
      GROUND_Y: 0,
      KICK_COYOTE: 0.22,
      KICK_COOLDOWN: 0.16,
      WALL_GRIP: 0.09,
      DASH_COOLDOWN: 7,
      STUN_TIME: 0.45,
      LOW_ALTITUDE: 170,
      WEB_SHOT_R: 13,
      WEB_SHOT_CD: 0.22,
      WEB_SHOT_LIFE: 0.75,
      WEB_MAX: 24,
      WEB_START: 16,
      WEB_PER_PIZZA: 5,
      WEB_COST_SWING: 1,
      WEB_COST_SHOT: 1,
      PERFECT_WINDOW: 0.13,
      PERFECT_BOOST: 1.14,
      TETHER_TIME: 2.4,
      RESCUE_FALL: 0.4,
    },
  };

  var CONST = { PACE: 1 };
  SW.CONST = CONST;

  /** Rebuild derived constants; safe to call at runtime from the settings. */
  SW.setPace = function (pace) {
    pace = clamp(pace, 0.35, 1.4);
    CONST.PACE = pace;
    var key;
    for (key in BASE.A) CONST[key] = BASE.A[key] * pace * pace;
    for (key in BASE.V) CONST[key] = BASE.V[key] * pace;
    for (key in BASE.FIXED) CONST[key] = BASE.FIXED[key];
    return pace;
  };

  SW.setPace(0.7);
})(window);
