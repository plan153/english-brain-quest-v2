/**
 * useSpeech — 음성 인식/합성 훅.
 * 원래 앱(english-thinking-dictionary-quest)의 안정 패턴 충실 이관:
 *  - startListening()은 동기 호출: 클릭 제스처 안에서 recognizer.start() 직접 호출.
 *    Promise로 감싸면 Safari/iOS에서 제스처가 끊겨 인식이 안 열림.
 *  - TTS가 켜져 있으면 인식이 먹통이 되는 브라우저가 있어 먼저 stopSynthesis().
 *  - audioBlob 캡처는 확장 대비 설계만 남겨둠 (반응 시간 측정은 Phase 2/3).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { speech } from '../adapters/speech';
import type { SpeechRecognitionLike, SpeechResult } from '../interfaces/SpeechResult';

export interface UseSpeechOptions {
  lang?: 'en' | 'ko';
}

export interface UseSpeechReturn {
  supported: boolean;
  ttsSupported: boolean;
  listening: boolean;
  speaking: boolean;
  error: string | null;
  lastResult: SpeechResult | null;
  /** 동기 호출 — 클릭 핸들러 안에서 바로 호출해야 Safari/iOS 제스처가 유지됨. */
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string, lang?: 'en' | 'ko') => Promise<void>;
  stopSpeaking: () => void;
  reset: () => void;
}

export function useSpeech(options: UseSpeechOptions = {}): UseSpeechReturn {
  const lang = options.lang ?? 'en';
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SpeechResult | null>(null);
  const startRef = useRef<number>(0);
  const recognizerRef = useRef<SpeechRecognitionLike | null>(null);

  const supported = speech.isRecognitionSupported();
  const ttsSupported = speech.isSynthesisSupported();

  /**
   * 동기 시작 — 반드시 사용자 제스처(클릭) 핸들러 안에서 직접 호출.
   * await를 사이에 끼우면 Safari/iOS에서 제스처가 끊겨 인식이 시작되지 않음.
   */
  const startListening = useCallback(() => {
    setError(null);
    setLastResult(null);

    if (!speech.createRecognition) {
      setError('SpeechRecognition not supported in this browser');
      return;
    }

    // TTS가 재생 중이면 인식이 먹통이 되는 브라우저가 있어 먼저 끊는다.
    speech.stopSynthesis();
    setSpeaking(false);

    let recognizer: NonNullable<ReturnType<typeof speech.createRecognition>>;
    try {
      recognizer = speech.createRecognition(lang);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    recognizerRef.current = recognizer;
    startRef.current = performance.now();
    setListening(true);

    recognizer.onstart = () => {
      setListening(true);
    };
    recognizer.onresult = (event) => {
      const result = event.results[0][0];
      const completedAt = performance.now();
      const sr: SpeechResult = {
        text: result.transcript,
        confidence: result.confidence,
        timing: {
          startedAt: startRef.current,
          completedAt,
          durationMs: completedAt - startRef.current,
        },
      };
      setLastResult(sr);
    };
    recognizer.onerror = (event) => {
      // 원래 앱 패턴 — 에러 종류별 사용자 친화적 안내.
      const code = event.error || '';
      let msg = '음성 인식에 실패했어요. 다시 말해 주세요.';
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        msg = '마이크 권한이 필요해요. 주소창의 마이크 아이콘을 클릭해 허용해 주세요.';
      } else if (code === 'no-speech') {
        msg = '말소리가 들리지 않았어요. 마이크를 확인하고 다시 말해 주세요.';
      } else if (code === 'audio-capture') {
        msg = '마이크를 열지 못했어요. 다른 앱이 마이크를 쓰는지 확인해 주세요.';
      } else if (code === 'aborted') {
        msg = ''; // 사용자가 의도적으로 중단 — 안내 없음.
      } else if (code === 'network') {
        msg = '네트워크 문제로 인식이 실패했어요. 인터넷 연결을 확인해 주세요.';
      } else if (code === 'language-not-supported') {
        msg = '지원하지 않는 언어 설정이에요.';
      }
      if (msg) setError(msg);
      // onerror 후 onend가 안 불리는 브라우저가 있어 listening이 true로 고정되는 버그 방지.
      // 이 상태가 되면 버튼이 영구 disabled되어 "말하기 안됨" 증상이 발생.
      setListening(false);
      recognizerRef.current = null;
    };
    recognizer.onend = () => {
      setListening(false);
      recognizerRef.current = null;
    };

    try {
      // 중요: 제스처 안에서 동기 start().
      recognizer.start();
    } catch (err) {
      // 이미 시작된 경우 등 — 무시 가능.
      setListening(false);
      recognizerRef.current = null;
      setError((err as Error).message);
    }
  }, [lang]);

  const stopListening = useCallback(() => {
    const r = recognizerRef.current;
    if (r) {
      try {
        r.stop();
      } catch (_) {
        /* ignore */
      }
      recognizerRef.current = null;
    }
    setListening(false);
  }, []);

  const speak = useCallback(
    async (text: string, speechLang: 'en' | 'ko' = 'en') => {
      setError(null);
      setSpeaking(true);
      try {
        await speech.synthesize(text, speechLang);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSpeaking(false);
      }
    },
    []
  );

  const stopSpeaking = useCallback(() => {
    speech.stopSynthesis();
    setSpeaking(false);
  }, []);

  const reset = useCallback(() => {
    setLastResult(null);
    setError(null);
    setListening(false);
    setSpeaking(false);
  }, []);

  useEffect(() => {
    return () => {
      speech.stopSynthesis();
      const r = recognizerRef.current;
      if (r) {
        try {
          r.abort();
        } catch (_) {
          /* ignore */
        }
      }
    };
  }, []);

  return {
    supported,
    ttsSupported,
    listening,
    speaking,
    error,
    lastResult,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    reset,
  };
}