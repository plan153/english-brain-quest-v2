/**
 * whisper-recognition.ts — SpeechRecognitionLike 계약을 구현하는 Whisper 기반 recognizer.
 * 브라우저 내장 SpeechRecognition과 동일한 이벤트 인터페이스(start/stop/abort +
 * onstart/onresult/onerror/onend)를 지켜, useSpeech.ts는 수정 없이 그대로 재사용한다.
 *
 * 실제 동작은 스트리밍이 아니라 "녹음 → stop 시 일괄 추론"이다:
 *  - start(): getUserMedia + MediaRecorder.start() (동기 호출, Safari 제스처 대응)
 *  - stop(): 녹음 정지 → 16kHz 모노로 리샘플 → Worker(Whisper)로 추론 → onresult(1회, isFinal)
 *  - Whisper는 무음 자동감지가 없어 stop()을 직접 호출해줘야 함(수동 종료 또는 maxListenMs 타이머).
 */
import type { SpeechRecognitionEvent, SpeechRecognitionLike } from '../interfaces/SpeechResult';
import { toWhisperInput } from './audio-resample';

let workerSingleton: Worker | null = null;
let reqSeq = 0;

function getWorker(): Worker {
  if (!workerSingleton) {
    workerSingleton = new Worker(new URL('./stt-worker.ts', import.meta.url), { type: 'module' });
  }
  return workerSingleton;
}

function transcribeInWorker(audio: Float32Array): Promise<string> {
  const worker = getWorker();
  const id = ++reqSeq;
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      const data = (event.data ?? {}) as { id?: number; type?: string; text?: string; message?: string };
      if (data.id !== id) return;
      if (data.type === 'result') {
        worker.removeEventListener('message', onMessage);
        resolve(data.text ?? '');
      } else if (data.type === 'error') {
        worker.removeEventListener('message', onMessage);
        reject(new Error(data.message || 'Whisper 인식 실패'));
      }
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage({ type: 'transcribe', id, audio });
  });
}

export function isWhisperSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof AudioContext !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function micErrorCode(err: unknown): string {
  const name = (err as { name?: string })?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'not-allowed';
  if (name === 'NotFoundError') return 'audio-capture';
  return 'audio-capture';
}

/** SpeechRecognitionLike 계약을 지키는 Whisper recognizer 생성 */
export function createWhisperRecognition(): SpeechRecognitionLike {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let cancelled = false;

  function cleanupStream() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    recorder = null;
  }

  async function finishAndTranscribe() {
    const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
    cleanupStream();
    if (cancelled || blob.size === 0) {
      if (!cancelled) recognizer.onend?.();
      return;
    }
    try {
      const audioCtx = new AudioContext();
      const arrayBuffer = await blob.arrayBuffer();
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      const channels: Float32Array[] = [];
      for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c));
      const input = toWhisperInput(channels, decoded.sampleRate);
      await audioCtx.close();
      const text = await transcribeInWorker(input);
      if (text) {
        const event: SpeechRecognitionEvent = {
          resultIndex: 0,
          results: {
            length: 1,
            0: { isFinal: true, 0: { transcript: text, confidence: 1 }, length: 1 },
          },
        };
        recognizer.onresult?.(event);
      }
    } catch (err) {
      console.error('[whisper-recognition] transcribe failed:', err);
      recognizer.onerror?.({ error: (err as Error).message || 'processing' });
    } finally {
      recognizer.onend?.();
    }
  }

  const recognizer: SpeechRecognitionLike = {
    lang: 'en-US',
    continuous: false,
    interimResults: false,

    start() {
      cancelled = false;
      chunks = [];
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((s) => {
          if (cancelled) {
            s.getTracks().forEach((t) => t.stop());
            return;
          }
          stream = s;
          recorder = new MediaRecorder(s);
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };
          recorder.onstop = () => {
            void finishAndTranscribe();
          };
          recorder.start();
          recognizer.onstart?.();
        })
        .catch((err) => {
          console.error('[whisper-recognition] getUserMedia failed:', err);
          recognizer.onerror?.({ error: micErrorCode(err) });
        });
    },

    stop() {
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      } else if (!stream) {
        // getUserMedia 대기 중 stop이 먼저 호출된 경우 — 스트림 도착 즉시 정리
        cancelled = true;
      }
    },

    abort() {
      cancelled = true;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.stop();
      }
      cleanupStream();
    },
  };

  return recognizer;
}
