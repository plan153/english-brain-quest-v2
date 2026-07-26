/**
 * speech.ts — Web Speech API 래퍼.
 * - 데스크톱/모바일 브라우저에서 webkitSpeechRecognition + speechSynthesis 사용.
 * - audioBlob 캡처는 향후 발음 분석을 위해 설계만 남겨둠 (MediaRecorder 확장 예정).
 */
import type { SpeechAdapter } from '../interfaces/SpeechResult';

function getRecognitionCtor(): (typeof window & { webkitSpeechRecognition?: unknown })['webkitSpeechRecognition'] | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as typeof window & {
    SpeechRecognition?: new () => unknown;
    webkitSpeechRecognition?: new () => unknown;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function createSpeechAdapter(): SpeechAdapter {
  const Recognition = getRecognitionCtor();
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

  function isRecognitionSupported() {
    return !!Recognition;
  }

  function isSynthesisSupported() {
    return !!synth;
  }

  function recognize(lang: 'en' | 'ko') {
    return new Promise<{ text: string; confidence?: number }>((resolve, reject) => {
      if (!Recognition) {
        reject(new Error('SpeechRecognition not supported in this browser'));
        return;
      }
      const recognizer = new (Recognition as new () => {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        maxAlternatives: number;
        start: () => void;
        stop: () => void;
        abort: () => void;
        onresult?: (event: { results: { 0: { 0: { transcript: string; confidence: number } } } }) => void;
        onerror?: (event: { error: string }) => void;
        onend?: () => void;
      })();
      recognizer.lang = lang === 'ko' ? 'ko-KR' : 'en-US';
      recognizer.continuous = false;
      recognizer.interimResults = false;
      recognizer.maxAlternatives = 1;
      let resolved = false;
      recognizer.onresult = (event) => {
        const result = event.results[0][0];
        resolved = true;
        resolve({ text: result.transcript, confidence: result.confidence });
      };
      recognizer.onerror = (event) => {
        resolved = true;
        reject(new Error(event.error || 'speech-recognition-error'));
      };
      recognizer.onend = () => {
        if (!resolved) resolve({ text: '' });
      };
      try {
        recognizer.start();
      } catch (err) {
        reject(err as Error);
      }
    });
  }

  function synthesize(text: string, lang: 'en' | 'ko' = 'en') {
    return new Promise<void>((resolve) => {
      if (!synth) {
        resolve();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === 'ko' ? 'ko-KR' : 'en-US';
      const voices = synth.getVoices();
      const preferred = voices.find((v) => v.lang.startsWith(lang === 'ko' ? 'ko' : 'en'));
      if (preferred) utterance.voice = preferred;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      synth.speak(utterance);
    });
  }

  function stopSynthesis() {
    if (synth) synth.cancel();
  }

  return {
    recognize,
    synthesize,
    stopSynthesis,
    isRecognitionSupported,
    isSynthesisSupported,
  };
}

export const speech = createSpeechAdapter();
export type { SpeechAdapter };
