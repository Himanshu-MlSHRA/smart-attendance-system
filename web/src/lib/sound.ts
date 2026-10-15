let ctx: AudioContext | null = null

/** A short two-note chime for "marked present" (rising) or a low buzz for errors. */
export function chime(kind: 'ok' | 'error' = 'ok') {
  try {
    ctx ??= new AudioContext()
    const notes = kind === 'ok' ? [660, 990] : [220, 180]
    notes.forEach((freq, i) => {
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      const t = ctx!.currentTime + i * 0.11
      osc.type = kind === 'ok' ? 'triangle' : 'square'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(t)
      osc.stop(t + 0.25)
    })
  } catch {
    /* audio blocked or unsupported; stay silent */
  }
}
