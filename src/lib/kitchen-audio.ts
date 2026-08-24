/**
 * A synthesized alert beep for the kitchen board — no audio asset to
 * source, license, or host. Pure function over a caller-supplied
 * `AudioContext`; keeps no state of its own.
 *
 * Browsers block `AudioContext` audio from ever starting without a prior
 * user gesture — the board's "Enable alert sound" button is what creates
 * the `AudioContext` in the first place, in direct response to a click.
 * This function just has to exist for that context to make a sound.
 */

export function playBeep(ctx: AudioContext): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(880, ctx.currentTime);

  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.35);
}
