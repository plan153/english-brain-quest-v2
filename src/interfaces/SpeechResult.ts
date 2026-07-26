export interface SpeechResult {
  text: string;
  confidence?: number;
  audioBlob?: Blob;
  timing?: {
    startedAt: number;
    completedAt: number;
    durationMs: number;
  };
  error?: string;
}

export type RecognitionState = 'idle' | 'listening' | 'processing' | 'error';

export interface SpeechRecognitionEvent {
  results: { 0: { 0: { transcript: string; confidence: number } } };
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult?: (event: SpeechRecognitionEvent) => void;
  onerror?: (event: { error: string }) => void;
  onend?: () => void;
  onstart?: () => void;
}

export interface SpeechSynthesisLike {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
}

export interface SpeechAdapter {
  /** Promise 기반 편의 API — Safari/iOS에서는 제스처가 끊길 수 있어 createRecognition 사용 권장. */
  recognize(lang: 'en' | 'ko'): Promise<{ text: string; confidence?: number }>;
  synthesize(text: string, lang?: 'en' | 'ko'): Promise<void>;
  stopSynthesis(): void;
  isRecognitionSupported(): boolean;
  isSynthesisSupported(): boolean;
  /** 제스처 안에서 동기 start()를 위해 recognizer 직접 생성. */
  createRecognition?(lang: 'en' | 'ko'): SpeechRecognitionLike;
}