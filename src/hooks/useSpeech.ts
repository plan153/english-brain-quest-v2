/**
 * useSpeech — 음성 인식/합성 훅.
 *  - startListening() 동기 호출 (Safari/iOS 제스처)
 *  - interimResults + final 즉시 stop → 침묵 대기 지연 축소
 *  - onResult 콜백으로 평가를 effect 없이 즉시 처리 가능
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { speech } from '../adapters/speech';
import type { SpeechRecognitionLike, SpeechResult } from '../interfaces/SpeechResult';

export interface UseSpeechOptions {
  lang?: 'en' | 'ko';
  /** final 결과가 확정되는 즉시 호출 (React effect보다 빠름) */
  onResult?: (result: SpeechResult) => void;
  /** 최대 청취 시간 (ms) — 초과 시 stop */
  maxListenMs?: number;
}

export interface UseSpeechReturn {
  supported: boolean;
  ttsSupported: boolean;
  listening: boolean;
  speaking: boolean;
  error: string | null;
  lastResult: SpeechResult | null;
  /** 인식 중 부분 결과 (빠른 피드백) */
  interimText: string;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string, lang?: 'en' | 'ko') => Promise<void>;
  stopSpeaking: () => void;
  reset: () => void;
}

export function useSpeech(options: UseSpeechOptions = {}): UseSpeechReturn {
  const lang = options.lang ?? 'en';
  const maxListenMs = options.maxListenMs ?? 8000;
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SpeechResult | null>(null);
  const [interimText, setInterimText] = useState('');
  const startRef = useRef<number>(0);
  const recognizerRef = useRef<SpeechRecognitionLike | null>(null);
  const finalizedRef = useRef(false);
  const onResultRef = useRef(options.onResult);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interimRef = useRef('');

  onResultRef.current = options.onResult;

  const supported = speech.isRecognitionSupported();
  const ttsSupported = speech.isSynthesisSupported();

  const clearMaxTimer = () => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  };

  const finalize = useCallback((text: string, confidence?: number) => {
    if (finalizedRef.current) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    finalizedRef.current = true;
    clearMaxTimer();

    const completedAt = performance.now();
    const sr: SpeechResult = {
      text: trimmed,
      confidence,
      timing: {
        startedAt: startRef.current,
        completedAt,
        durationMs: completedAt - startRef.current,
      },
    };
    setLastResult(sr);
    setInterimText('');
    setListening(false);
    onResultRef.current?.(sr);

    const r = recognizerRef.current;
    if (r) {
      try {
        r.stop();
      } catch (_) {
        /* ignore */
      }
      recognizerRef.current = null;
    }
  }, []);

  const startListening = useCallback(() => {
    setError(null);
    setLastResult(null);
    setInterimText('');
    interimRef.current = '';
    finalizedRef.current = false;
    clearMaxTimer();

    if (!speech.createRecognition) {
      setError('SpeechRecognition not supported in this browser');
      return;
    }

    speech.stopSynthesis();
    setSpeaking(false);

    // 이전 인식기가 남아 있으면 정리
    const prev = recognizerRef.current;
    if (prev) {
      try {
        prev.abort();
      } catch (_) {
        /* ignore */
      }
      recognizerRef.current = null;
    }

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
      if (finalizedRef.current) return;
      let finalChunk = '';
      let interimChunk = '';
      const results = event.results;
      const startIdx = typeof event.resultIndex === 'number' ? event.resultIndex : 0;
      for (let i = startIdx; i < results.length; i++) {
        const row = results[i];
        const transcript = row?.[0]?.transcript ?? '';
        if (row.isFinal) finalChunk += transcript;
        else interimChunk += transcript;
      }
      if (finalChunk.trim()) {
        finalize(finalChunk, results[results.length - 1]?.[0]?.confidence);
        return;
      }
      if (interimChunk.trim()) {
        interimRef.current = interimChunk.trim();
        setInterimText(interimChunk.trim());
      }
    };

    recognizer.onerror = (event) => {
      const code = event.error || '';
      let msg = '음성 인식에 실패했어요. 다시 말해 주세요.';
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        msg = '마이크 권한이 필요해요. 주소창의 마이크 아이콘을 클릭해 허용해 주세요.';
      } else if (code === 'no-speech') {
        msg = '말소리가 들리지 않았어요. 마이크를 확인하고 다시 말해 주세요.';
      } else if (code === 'audio-capture') {
        msg = '마이크를 열지 못했어요. 다른 앱이 마이크를 쓰는지 확인해 주세요.';
      } else if (code === 'aborted') {
        msg = '';
      } else if (code === 'network') {
        msg = '네트워크 문제로 인식이 실패했어요. 인터넷 연결을 확인해 주세요.';
      } else if (code === 'language-not-supported') {
        msg = '지원하지 않는 언어 설정이에요.';
      }
      if (msg) setError(msg);
      clearMaxTimer();
      setListening(false);
      recognizerRef.current = null;
    };

    recognizer.onend = () => {
      if (!finalizedRef.current && interimRef.current) {
        finalize(interimRef.current);
      }
      clearMaxTimer();
      setListening(false);
      recognizerRef.current = null;
    };

    try {
      recognizer.start();
      maxTimerRef.current = setTimeout(() => {
        const r = recognizerRef.current;
        if (r && !finalizedRef.current) {
          try {
            r.stop(); // onresult final 유도
          } catch (_) {
            setListening(false);
          }
        }
      }, maxListenMs);
    } catch (err) {
      setListening(false);
      recognizerRef.current = null;
      setError((err as Error).message);
    }
  }, [lang, maxListenMs, finalize]);

  const stopListening = useCallback(() => {
    clearMaxTimer();
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
    clearMaxTimer();
    finalizedRef.current = true; // 진행 중 결과 무시
    setLastResult(null);
    setInterimText('');
    setError(null);
    setListening(false);
    setSpeaking(false);
    const r = recognizerRef.current;
    if (r) {
      try {
        r.abort();
      } catch (_) {
        /* ignore */
      }
      recognizerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearMaxTimer();
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
    interimText,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    reset,
  };
}
