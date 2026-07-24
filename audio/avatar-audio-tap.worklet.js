// Pass-through tap: plays audio AND posts 16k mono Int16 frames to the main thread.
class AvatarAudioTap extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    this.targetRate = (opts.processorOptions && opts.processorOptions.targetRate) || 16000;
    this.frameSize  = (opts.processorOptions && opts.processorOptions.frameSize)  || 3200; // 200ms @16k
    this.pos = 0; 
    this.acc = new Float32Array(this.frameSize * 2); 
    this.flushed = false;
    this.inputOffset = 0; // fractional index tracking input stream position
    this.port.onmessage = (e) => { if (e.data === 'flush') { this.pos = 0; this.flushed = true; } };
  }
  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const out   = outputs[0] && outputs[0][0];
    if (!input) return true;
    if (out) out.set(input);                                  // pass-through to speakers
    
    const ratio = sampleRate / this.targetRate;
    const a = this.acc;
    
    while (this.inputOffset < input.length) {
      const idx = Math.floor(this.inputOffset);
      const nextIdx = idx + 1;
      const frac = this.inputOffset - idx;
      
      const s0 = input[idx];
      const s1 = nextIdx < input.length ? input[nextIdx] : s0;
      
      a[this.pos++] = s0 * (1 - frac) + s1 * frac;
      
      if (this.pos >= this.frameSize) {
        const i16 = new Int16Array(this.frameSize);
        for (let k = 0; k < this.frameSize; k++) {
          i16[k] = Math.max(-32768, Math.min(32767, a[k] * 32767));
        }
        this.port.postMessage(i16.buffer, [i16.buffer]);      // zero-copy
        this.pos = 0; 
        this.flushed = false;
      }
      
      this.inputOffset += ratio;
    }
    
    this.inputOffset -= input.length;
    return true;
  }
}
registerProcessor('avatar-audio-tap', AvatarAudioTap);
