/**
 * capture-processor.js — Off-main-thread microphone capture AudioWorklet.
 *
 * Runs inside the browser's AudioWorkletGlobalScope.
 * Receives raw PCM frames from the mic (browser native sample rate),
 * downsamples to 16 kHz, encodes as base64, and posts chunks to the main
 * thread via MessagePort so they can be sent to Gemini Live over WebSocket.
 *
 * Usage (main thread):
 *   await audioContext.audioWorklet.addModule('/worklets/capture-processor.js')
 *   const node = new AudioWorkletNode(audioContext, 'capture-processor')
 *   node.port.onmessage = (e) => sendToGemini(e.data.b64)
 *
 * VERTEX AI COMPAT: The output of this worklet feeds sendClientContent(),
 * NOT sendRealtimeInput(). See useGeminiLive.ts for the correct send pattern.
 */

const TARGET_SAMPLE_RATE = 16000; // Gemini Live input rate

// AudioWorkletGlobalScope does NOT expose btoa/atob — implement manually.
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function encodeBase64(bytes) {
  let out = '';
  let i = 0;
  const len = bytes.length;
  for (; i + 2 < len; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += B64_CHARS[a >> 2];
    out += B64_CHARS[((a & 0x03) << 4) | (b >> 4)];
    out += B64_CHARS[((b & 0x0f) << 2) | (c >> 6)];
    out += B64_CHARS[c & 0x3f];
  }
  if (i < len) {
    const a = bytes[i];
    out += B64_CHARS[a >> 2];
    if (i + 1 < len) {
      const b = bytes[i + 1];
      out += B64_CHARS[((a & 0x03) << 4) | (b >> 4)];
      out += B64_CHARS[(b & 0x0f) << 2];
      out += '=';
    } else {
      out += B64_CHARS[(a & 0x03) << 4];
      out += '==';
    }
  }
  return out;
}

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // sampleRate is a global in AudioWorkletGlobalScope — the browser's capture rate
    this._ratio = sampleRate / TARGET_SAMPLE_RATE;
    this._buffer = [];
    // Flush every ~250ms worth of 16kHz samples to balance latency vs packet overhead
    this._flushThreshold = Math.ceil(TARGET_SAMPLE_RATE * 0.25);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const raw = input[0]; // Float32Array, browser native sample rate

    // Downsample via linear interpolation
    const downsampled = this._downsample(raw, this._ratio);

    // Accumulate into buffer
    for (let i = 0; i < downsampled.length; i++) {
      this._buffer.push(downsampled[i]);
    }

    // Flush when enough samples accumulated
    if (this._buffer.length >= this._flushThreshold) {
      this._flush();
    }

    return true; // keep processor alive
  }

  _downsample(input, ratio) {
    if (ratio === 1) return input;
    const outputLength = Math.floor(input.length / ratio);
    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const lo = Math.floor(srcIndex);
      const hi = Math.min(lo + 1, input.length - 1);
      const frac = srcIndex - lo;
      output[i] = input[lo] * (1 - frac) + input[hi] * frac;
    }
    return output;
  }

  _flush() {
    if (this._buffer.length === 0) return;

    // Convert Float32 [-1, 1] → Int16 PCM
    const pcm16 = new Int16Array(this._buffer.length);
    for (let i = 0; i < this._buffer.length; i++) {
      const clamped = Math.max(-1, Math.min(1, this._buffer[i]));
      pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    this._buffer = [];

    // Encode to base64 for WebSocket transmission
    const bytes = new Uint8Array(pcm16.buffer);
    const b64 = encodeBase64(bytes);

    this.port.postMessage({ b64, sampleRate: TARGET_SAMPLE_RATE });
  }
}

registerProcessor('capture-processor', CaptureProcessor);
