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

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult?: (event: unknown) => void;
  onerror?: (event: unknown) => void;
  onend?: () => void;
  onstart?: () => void;
}

export interface SpeechSynthesisLike {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
}

export interface SpeechAdapter {
  recognize(lang: 'en' | 'ko'): Promise<{ text: string; confidence?: number }>;
  synthesize(text: string, lang?: 'en' | 'ko'): Promise<void>;
  stopSynthesis(): void;
  isRecognitionSupported(): boolean;
  isSynthesisSupported(): boolean;
}
