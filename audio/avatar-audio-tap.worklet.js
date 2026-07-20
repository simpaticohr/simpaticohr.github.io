// Pass-through tap: plays audio AND posts 16k mono Int16 frames to the main thread.
class AvatarAudioTap extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    this.targetRate = (opts.processorOptions && opts.processorOptions.targetRate) || 16000;
    this.frameSize  = (opts.processorOptions && opts.processorOptions.frameSize)  || 3200; // 200ms @16k
    this.pos = 0; this.acc = new Float32Array(this.frameSize * 2); this.flushed = false;
    this.port.onmessage = (e) => { if (e.data === 'flush') { this.pos = 0; this.flushed = true; } };
  }
  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const out   = outputs[0] && outputs[0][0];
    if (!input) return true;
    if (out) out.set(input);                                  // pass-through to speakers
    const ratio = sampleRate / this.targetRate;
    for (let i = 0; i < input.length; i++) {
      const src = i / ratio; const i0 = src | 0; const frac = src - i0;
      const a = this.acc; // linear resample + stereo->mono already (ch0)
      a[this.pos++] = input[i0] * (1 - frac) + (input[i0 + 1] || input[i0]) * frac;
      if (this.pos >= this.frameSize) {
        const i16 = new Int16Array(this.frameSize);
        for (let k = 0; k < this.frameSize; k++) i16[k] = Math.max(-32768, Math.min(32767, a[k] * 32767));
        this.port.postMessage(i16.buffer, [i16.buffer]);      // zero-copy
        this.pos = 0; this.flushed = false;
      }
    }
    return true;
  }
}
registerProcessor('avatar-audio-tap', AvatarAudioTap);
