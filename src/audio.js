(function (global) {
  "use strict";

  var SW = (global.SW = global.SW || {});

  function Audio() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
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
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
  };

  Audio.prototype.toggleMute = function () {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
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
