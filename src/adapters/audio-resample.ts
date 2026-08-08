/**
 * audio-resample.ts — Whisper 입력 전처리 (순수 함수, DOM 없이 테스트 가능).
 * MediaRecorder로 받은 오디오(AudioBuffer)를 16kHz 모노 Float32Array로 변환한다.
 */

export const WHISPER_SAMPLE_RATE = 16000;

/** 여러 채널을 모노로 평균 */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length <= 1) return channels[0] ?? new Float32Array(0);
  const length = channels[0]?.length ?? 0;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const ch of channels) sum += ch[i] ?? 0;
    out[i] = sum / channels.length;
  }
  return out;
}

/** 선형보간 리샘플링 */
export function resampleLinear(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate || input.length === 0) return input;
  const ratio = inputRate / outputRate;
  const outLength = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;
    const a = input[srcIndex] ?? 0;
    const b = input[srcIndex + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/** 채널 배열 + 원본 샘플레이트 → Whisper 입력(16kHz 모노) */
export function toWhisperInput(channels: Float32Array[], sampleRate: number): Float32Array {
  const mono = toMono(channels);
  return resampleLinear(mono, sampleRate, WHISPER_SAMPLE_RATE);
}
