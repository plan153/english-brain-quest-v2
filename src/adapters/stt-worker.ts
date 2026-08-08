/**
 * stt-worker.ts — Whisper(tiny.en) 음성 인식을 백그라운드에서 수행하는 Web Worker.
 * 메인 스레드(UI)를 막지 않기 위해 추론을 여기서 돌린다.
 * 모델은 최초 1회 Hugging Face CDN에서 받아 브라우저 Cache API에 저장, 이후 오프라인 재사용.
 */
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = 'Xenova/whisper-tiny.en';

type Transcriber = (
  audio: Float32Array,
  options?: Record<string, unknown>
) => Promise<{ text: string } | { text: string }[]>;

let transcriberPromise: Promise<Transcriber> | null = null;

function getTranscriber(): Promise<Transcriber> {
  if (!transcriberPromise) {
    transcriberPromise = pipeline('automatic-speech-recognition', MODEL_ID, {
      // 디코더는 q4/q8 블록양자화 파일이 깨져있어(MatMulNBits 에러) fp32 필수.
      // 인코더는 문제없이 q8로 됐던 걸로 보여 용량/속도를 위해 q8 유지.
      dtype: { encoder_model: 'q8', decoder_model_merged: 'fp32' },
      // WebGPU 지원 브라우저면 자동으로 GPU 가속 (훨씬 빠름), 없으면 WASM으로 폴백.
      device: 'auto',
      progress_callback: (progress: unknown) => {
        self.postMessage({ type: 'progress', progress });
      },
    }) as unknown as Promise<Transcriber>;
  }
  return transcriberPromise;
}

self.onmessage = async (event: MessageEvent) => {
  const { type, id, audio } = (event.data ?? {}) as {
    type?: string;
    id?: number;
    audio?: Float32Array;
  };
  if (type !== 'transcribe' || !audio) return;
  try {
    const t0 = performance.now();
    const transcribe = await getTranscriber();
    const t1 = performance.now();
    // whisper-tiny.en은 영어 전용 모델이라 language/task를 지정하면 에러남 (다국어 모델 전용 옵션)
    const result = await transcribe(audio);
    const t2 = performance.now();
    const webgpuAvailable = typeof navigator !== 'undefined' && 'gpu' in navigator;
    console.log(
      `[stt-worker] webgpu_available=${webgpuAvailable} audio=${(audio.length / 16000).toFixed(1)}s ` +
        `model_ready=${(t1 - t0).toFixed(0)}ms infer=${(t2 - t1).toFixed(0)}ms`
    );
    const text = Array.isArray(result) ? (result[0]?.text ?? '') : (result?.text ?? '');
    self.postMessage({ type: 'result', id, text: String(text).trim() });
  } catch (err) {
    console.error('[stt-worker] whisper failed:', err);
    self.postMessage({ type: 'error', id, message: (err as Error).message || 'whisper-error' });
  }
};
