/**
 * VoskAudioProcessor — AudioWorkletProcessor for Vayris STT pipeline.
 * 
 * Runs on the audio rendering thread (off main thread) to prevent frame drops
 * caused by React/Three.js main-thread work.
 * 
 * Responsibilities:
 * 1. Receive raw Float32 mono audio at native hardware rate (e.g. 48000 Hz)
 * 2. Downsample to 16000 Hz using averaging decimation (exact 3:1 ratio for 48k→16k)
 * 3. Post resampled buffers to main thread via MessagePort
 */
class VoskAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._active = true;
    this.phase = 0.0;
    this.sum = 0.0;
    this.count = 0;
    this.port.onmessage = (e) => {
      if (e.data && e.data.command === 'stop') {
        this._active = false;
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (!this._active) return false;

    const input = inputs[0];
    if (!input || input.length === 0) return true;

    // Downmix all available channels to mono to handle mics that only have audio on one channel
    const numChannels = input.length;
    const channelLen = input[0].length;
    const channelData = new Float32Array(channelLen);
    
    for (let i = 0; i < channelLen; i++) {
        let sum = 0;
        for (let c = 0; c < numChannels; c++) {
            sum += input[c][i];
        }
        channelData[i] = sum / numChannels;
    }

    // Downsample from native rate to 16000 Hz.
    // AudioWorklet runs at AudioContext.sampleRate.
    const ratio = sampleRate / 16000;

    if (Math.abs(ratio - 1.0) < 0.01) {
      // Already at 16kHz — pass through
      const copy = new Float32Array(channelData.length);
      copy.set(channelData);
      this.port.postMessage({ type: 'audio', samples: copy }, [copy.buffer]);
    } else {
      // Downsample using stateful averaging decimation to avoid block boundary gaps
      const output = [];
      for (let i = 0; i < channelData.length; i++) {
          this.sum += channelData[i];
          this.count++;
          this.phase += 1.0;
          
          if (this.phase >= ratio) {
              this.phase -= ratio;
              output.push(this.sum / this.count);
              this.sum = 0.0;
              this.count = 0;
          }
      }

      if (output.length > 0) {
          const outArray = new Float32Array(output);
          this.port.postMessage({ type: 'audio', samples: outArray }, [outArray.buffer]);
      }
    }

    return true;
  }
}

registerProcessor('vosk-audio-processor', VoskAudioProcessor);
