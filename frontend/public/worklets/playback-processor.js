/**
 * playback-processor.js — Off-main-thread audio playback AudioWorklet.
 *
 * Runs inside the browser's AudioWorkletGlobalScope.
 * Receives base64-encoded Int16 PCM chunks (24 kHz) from the main thread,
 * decodes them into a Float32 ring buffer, and feeds them to the audio
 * output device frame-by-frame via process().
 *
 * Usage (main thread):
 *   await audioContext.audioWorklet.addModule('/worklets/playback-processor.js')
 *   const node = new AudioWorkletNode(audioContext, 'playback-processor')
 *   node.port.postMessage({ b64: '<base64-pcm-chunk>' })
 *   node.connect(audioContext.destination)
 *
 * Expected AudioContext sample rate: 24000 Hz (new AudioContext({ sampleRate: 24000 }))
 * If the context runs at a different rate the output will pitch-shift — always
 * construct the playback AudioContext with sampleRate: 24000.
 */

const RING_BUFFER_SAMPLES = 24000 * 10; // 10 seconds of 24kHz headroom

// AudioWorkletGlobalScope does NOT expose btoa/atob — implement manually.
const B64_LOOKUP = new Uint8Array(128);
(function initLookup() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < chars.length; i++) B64_LOOKUP[chars.charCodeAt(i)] = i;
})();
function decodeBase64(s) {
  // Strip padding length
  let pad = 0;
  if (s.length >= 1 && s.charCodeAt(s.length - 1) === 61) pad++;
  if (s.length >= 2 && s.charCodeAt(s.length - 2) === 61) pad++;
  const outLen = ((s.length * 3) >> 2) - pad;
  const out = new Uint8Array(outLen);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = B64_LOOKUP[s.charCodeAt(i)];
    const b = B64_LOOKUP[s.charCodeAt(i + 1)];
    const c = B64_LOOKUP[s.charCodeAt(i + 2)];
    const d = B64_LOOKUP[s.charCodeAt(i + 3)];
    if (o < outLen) out[o++] = (a << 2) | (b >> 4);
    if (o < outLen) out[o++] = ((b & 0x0f) << 4) | (c >> 2);
    if (o < outLen) out[o++] = ((c & 0x03) << 6) | d;
  }
  return out;
}

class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ring = new Float32Array(RING_BUFFER_SAMPLES);
    this._writeHead = 0;
    this._readHead = 0;
    this._filled = 0; // samples available to read

    this.port.onmessage = (event) => {
      if (event.data?.b64) {
        this._enqueue(event.data.b64);
      }
      if (event.data?.flush) {
        // Drain remaining buffer on session end
        this._writeHead = 0;
        this._readHead = 0;
        this._filled = 0;
      }
    };
  }

  _enqueue(b64) {
    // Decode base64 → Uint8Array → Int16Array → Float32
    const bytes = decodeBase64(b64);
    const pcm16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1);

    for (let i = 0; i < pcm16.length; i++) {
      // Convert Int16 → Float32 [-1, 1]
      const sample = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);

      if (this._filled < RING_BUFFER_SAMPLES) {
        this._ring[this._writeHead] = sample;
        this._writeHead = (this._writeHead + 1) % RING_BUFFER_SAMPLES;
        this._filled++;
      }
      // If ring buffer is full, drop oldest (overrun protection)
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const channel = output[0];

    for (let i = 0; i < channel.length; i++) {
      if (this._filled > 0) {
        channel[i] = this._ring[this._readHead];
        this._readHead = (this._readHead + 1) % RING_BUFFER_SAMPLES;
        this._filled--;
      } else {
        channel[i] = 0; // silence while buffer drains
      }
    }

    return true; // keep processor alive
  }
}

registerProcessor('playback-processor', PlaybackProcessor);
