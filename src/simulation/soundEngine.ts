export class RescueSoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private lastStepTime = 0;
  private lastAlertTime = 0;
  private lastScanTime = 0;

  public setMuted(muted: boolean) {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playFootstep(nowMs: number) {
    if (this.muted || nowMs - this.lastStepTime < 520) return;
    this.lastStepTime = nowMs;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.035);
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.045);
  }

  public playScanSweep() {
    const now = performance.now();
    if (this.muted || now - this.lastScanTime < 900) return;
    this.lastScanTime = now;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(840, t + 0.12);
    gain.gain.setValueAtTime(0.025, t);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  public playSafetyAlert() {
    const now = performance.now();
    if (this.muted || now - this.lastAlertTime < 1500) return;
    this.lastAlertTime = now;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(380, t + i * 0.14);
      gain.gain.setValueAtTime(0.03, t + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.0005, t + i * 0.14 + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + i * 0.14);
      osc.stop(t + i * 0.14 + 0.11);
    }
  }

  public playSurvivorFound() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const notes = [523.25, 659.25, 783.99];
    const t = ctx.currentTime;
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + idx * 0.09);
      gain.gain.setValueAtTime(0.045, t + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.0005, t + idx * 0.09 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + idx * 0.09);
      osc.stop(t + idx * 0.09 + 0.24);
    });
  }

  public playRelayConfirm() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(1174.66, t + 0.07);
    gain.gain.setValueAtTime(0.035, t);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  }
}
