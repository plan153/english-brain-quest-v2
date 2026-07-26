/**
 * speech.ts — Web Speech API 래퍼.
 * 기존 english-thinking-dictionary-quest의 핵심 안정 기법 충실 이관:
 *  - naturalVoiceScore로 자연스러운 영어 음성 선택 (Google/Samantha/Alex/Ava 우선)
 *  - rate 0.78, pitch 1.02, volume 1 (한국어 rate 0.92)
 *  - Safari/iOS 대응: cancel() 후 speak(), 60ms 후 미시작 시 재시도
 *  - STT: createRecognition()으로 recognizer를 반환 → useSpeech에서
 *    클릭 제스처 안에서 동기 start() 호출 (Promise 래핑 시 Safari/iOS 제스처 끊김)
 */
import type { SpeechAdapter, SpeechRecognitionLike } from '../interfaces/SpeechResult';

type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as typeof window & {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function naturalVoiceScore(voice: SpeechSynthesisVoice): number {
  const name = `${voice.name || ''} ${voice.voiceURI || ''}`.toLowerCase();
  const lang = String(voice.lang || '').toLowerCase();
  if (!lang.startsWith('en')) return -100;
  let score = lang === 'en-us' ? 40 : lang.startsWith('en-') ? 24 : 12;
  if (/samantha|alex|ava|allison|susan|victoria|karen|moira|tessa|daniel|serena/.test(name)) score += 35;
  if (/google us english|google uk english/.test(name)) score += 30;
  if (/premium|enhanced|neural|natural|online/.test(name)) score += 24;
  if (/compact|basic|default|espeak|festival/.test(name)) score -= 30;
  if (voice.localService) score += 4;
  return score;
}

function selectEnglishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const english = voices.filter((v) => String(v.lang || '').toLowerCase().startsWith('en'));
  if (!english.length) return null;
  return english.sort((a, b) => naturalVoiceScore(b) - naturalVoiceScore(a))[0] ?? null;
}

function selectKoreanVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const korean = voices.filter((v) => String(v.lang || '').toLowerCase().startsWith('ko'));
  if (!korean.length) return null;
  return (
    korean.sort((a, b) => {
      const score = (name: string) => {
        let value = 0;
        if (/premium|enhanced|neural|natural|google|apple|yuna|sora|kyoko/.test(name)) value += 20;
        if (/ko-kr|korean/.test(name)) value += 10;
        return value;
      };
      return score(`${b.name} ${b.lang}`.toLowerCase()) - score(`${a.name} ${a.lang}`.toLowerCase());
    })[0] ?? korean[0]
  );
}

let cachedEnglishVoice: SpeechSynthesisVoice | null = null;
let cachedKoreanVoice: SpeechSynthesisVoice | null = null;

function prepareVoices(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  cachedEnglishVoice = selectEnglishVoice();
  cachedKoreanVoice = selectKoreanVoice();
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  prepareVoices();
  window.speechSynthesis.onvoiceschanged = prepareVoices;
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

  /**
   * recognizer 직접 반환 — useSpeech에서 클릭 제스처 안에서 start() 동기 호출.
   * Promise로 감싸면 Safari/iOS에서 제스처가 끊겨 인식이 시작되지 않음.
   */
  function createRecognition(lang: 'en' | 'ko'): SpeechRecognitionLike {
    if (!Recognition) {
      throw new Error('SpeechRecognition not supported in this browser');
    }
    const recognizer = new Recognition();
    recognizer.lang = lang === 'ko' ? 'ko-KR' : 'en-US';
    recognizer.continuous = false;
    // interim으로 빠르게 받고, final 나오는 즉시 stop (침묵 대기 단축)
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;
    return recognizer;
  }

  /** Promise 편의 API — 데스크톱 Chrome 등 제스처 무관 환경에서만 사용 권장. */
  function recognize(lang: 'en' | 'ko') {
    return new Promise<{ text: string; confidence?: number }>((resolve, reject) => {
      if (!Recognition) {
        reject(new Error('SpeechRecognition not supported in this browser'));
        return;
      }
      const recognizer = createRecognition(lang);
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
      // Safari/iOS: cancel() 직후 speak()가 무시되는 경우가 많아 짧게 끊고 다시 재생.
      try {
        synth.cancel();
        if (synth.paused) synth.resume();
      } catch (_) {
        /* ignore */
      }
      const utterance = new SpeechSynthesisUtterance(text);
      const isKorean = lang === 'ko';
      const voice = isKorean ? cachedKoreanVoice ?? selectKoreanVoice() : cachedEnglishVoice ?? selectEnglishVoice();
      if (voice) {
        if (isKorean) cachedKoreanVoice = voice;
        else cachedEnglishVoice = voice;
        utterance.voice = voice;
        utterance.lang = voice.lang || (isKorean ? 'ko-KR' : 'en-US');
      } else {
        utterance.lang = isKorean ? 'ko-KR' : 'en-US';
      }
      utterance.rate = isKorean ? 0.92 : 0.78;
      utterance.pitch = 1.02;
      utterance.volume = 1;
      const play = () => {
        try {
          if (synth.paused) synth.resume();
          synth.speak(utterance);
        } catch (_) {
          /* ignore */
        }
      };
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      play();
      // Safari 재시도: 60ms 후 아직 시작 안 했으면 다시
      window.setTimeout(() => {
        if (!synth.speaking && !synth.pending) play();
      }, 60);
    });
  }

  function stopSynthesis() {
    if (synth) {
      try {
        synth.cancel();
        if (synth.paused) synth.resume();
      } catch (_) {
        /* ignore */
      }
    }
  }

  const adapter: SpeechAdapter = {
    recognize,
    synthesize,
    stopSynthesis,
    isRecognitionSupported,
    isSynthesisSupported,
  };
  if (Recognition) {
    adapter.createRecognition = createRecognition;
  }
  return adapter;
}

export const speech = createSpeechAdapter();
export type { SpeechAdapter };