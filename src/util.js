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

  SW.util = {
    TAU: TAU,
    clamp: clamp,
    lerp: lerp,
    damp: damp,
    mulberry32: mulberry32,
    Rng: Rng,
    hash01: hash01,
  };

  SW.CONST = {
    GRAVITY: 2000,
    MAX_ROPE: 560,
    MIN_ROPE: 80,
    REEL_SPEED: 500,
    SWING_ACCEL: 1350,
    AIR_ACCEL: 780,
    RUN_ACCEL: 2600,
    RUN_MAX: 620,
    JUMP_VELOCITY: 940,
    WALL_SLIDE: 150,
    WALL_CLIMB: 280,
    WALL_JUMP_X: 680,
    WALL_JUMP_Y: 900,
    MAX_SPEED: 2700,
    FATAL_IMPACT: 950,
    DRAG_FREE: 0.09,
    DRAG_ATTACHED: 0.035,
    PLAYER_R: 13,
    WEB_RANGE: 580,
    MIN_ANCHOR_RISE: 45,
    WEB_SPEED: 4200,
    PIXELS_PER_METER: 10,
    GROUND_Y: 0,
  };
})(window);
