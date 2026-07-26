/**
 * useSpeech — 음성 인식/합성 훅.
 * audioBlob 캡처는 확장 대비 설계만 남겨둠 (반응 시간 측정은 Phase 2/3).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { speech } from '../adapters/speech';
import type { SpeechResult } from '../interfaces/SpeechResult';

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
  startListening: () => Promise<void>;
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

  const supported = speech.isRecognitionSupported();
  const ttsSupported = speech.isSynthesisSupported();

  const startListening = useCallback(async () => {
    setError(null);
    setLastResult(null);
    setListening(true);
    startRef.current = performance.now();
    try {
      const { text, confidence } = await speech.recognize(lang);
      const completedAt = performance.now();
      const result: SpeechResult = {
        text,
        confidence,
        timing: {
          startedAt: startRef.current,
          completedAt,
          durationMs: completedAt - startRef.current,
        },
      };
      setLastResult(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setListening(false);
    }
  }, [lang]);

  const stopListening = useCallback(() => {
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
