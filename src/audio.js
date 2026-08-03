(function (global) {
  "use strict";

  var SW = (global.SW = global.SW || {});

  function Audio() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.volume = 0.5;
  }

  Audio.prototype.unlock = function () {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    var Ctor = global.AudioContext || global.webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    this.startWind();
  };

  Audio.prototype.toggleMute = function () {
    this.muted = !this.muted;
    this._applyGain();
    return this.muted;
  };

  Audio.prototype.setVolume = function (v) {
    this.volume = Math.max(0, Math.min(1, v));
    this._applyGain();
  };

  Audio.prototype._applyGain = function () {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  };

  Audio.prototype.dash = function () {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var osc = this.ctx.createOscillator();
    var gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.18);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    var filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1600, t);
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.28);
  };

  /**
   * Continuous wind layer. Speed opens a bandpass filter and raises its gain,
   * which sells velocity better than anything on screen.
   */
  Audio.prototype.startWind = function () {
    if (!this.ctx || this.windSrc) return;
    var src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(2.5);
    src.loop = true;
    var filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.8;
    filter.frequency.value = 400;
    var gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.windSrc = src;
    this.windFilter = filter;
    this.windGain = gain;
  };

  /** level: 0..1, usually speed / MAX_SPEED. */
  Audio.prototype.setWind = function (level) {
    if (!this.windGain) return;
    var t = this.ctx.currentTime;
    var l = Math.max(0, Math.min(1, level));
    this.windGain.gain.setTargetAtTime(l * l * 0.34, t, 0.12);
    this.windFilter.frequency.setTargetAtTime(320 + l * 1500, t, 0.15);
  };

  Audio.prototype._noiseBuffer = function (seconds) {
    var n = Math.floor(this.ctx.sampleRate * seconds);
    var buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  };

  Audio.prototype.thwip = function () {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.14);
    var filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(2600, t);
    filter.frequency.exponentialRampToValueAtTime(600, t + 0.13);
    var gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + 0.15);
  };

  Audio.prototype.ping = function (step) {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var osc = this.ctx.createOscillator();
    var gain = this.ctx.createGain();
    osc.type = "triangle";
    var semitone = Math.min(step || 0, 14);
    osc.frequency.setValueAtTime(660 * Math.pow(2, semitone / 12), t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.28, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.28);
  };

  Audio.prototype.crash = function () {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.6);
    var filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.5);
    var gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + 0.62);
  };

  Audio.prototype.kick = function () {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.22);
    var filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 1.6;
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(2200, t + 0.18);
    var gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + 0.24);

    var osc = this.ctx.createOscillator();
    var og = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.14);
    og.gain.setValueAtTime(0.3, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(og).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.18);
  };

  /** Two descending blips: the spinneret is running dry. */
  Audio.prototype.warn = function () {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    for (var i = 0; i < 2; i++) {
      var osc = this.ctx.createOscillator();
      var gain = this.ctx.createGain();
      var at = t + i * 0.16;
      osc.type = "square";
      osc.frequency.setValueAtTime(i ? 520 : 700, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.16, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
      osc.connect(gain).connect(this.master);
      osc.start(at);
      osc.stop(at + 0.15);
    }
  };

  /** Low thump when the street is close and the dash is still available. */
  Audio.prototype.slowmo = function () {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var osc = this.ctx.createOscillator();
    var gain = this.ctx.createGain();
    var filter = this.ctx.createBiquadFilter();
    osc.type = "sine";
    osc.frequency.setValueAtTime(92, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.38);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(420, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.28, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.45);
  };

  Audio.prototype.thud = function () {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var osc = this.ctx.createOscillator();
    var gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.16);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.22);
  };

  SW.audio = new Audio();
})(window);
