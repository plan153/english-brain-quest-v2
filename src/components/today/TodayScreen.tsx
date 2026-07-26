import { useCallback, useMemo, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useSpeech } from '../../hooks/useSpeech';
import { useStore } from '../../state/store';
import type { MatchLevel } from '../../interfaces/Evaluator';

interface FeedbackState {
  level: MatchLevel;
  feedback: string;
  canonicalTTS: string;
}

const SAMPLE_SENTENCES: { id: string; en: string; ko: string }[] = [
  { id: 'demo-01', en: "She grabbed the ball and ran.", ko: '그녀는 공을 잡고 뛰었다.' },
  { id: 'demo-02', en: "I have a question.", ko: '나는 질문이 있어.' },
  { id: 'demo-03', en: "Take your time.", ko: '천천히 해.' },
  { id: 'demo-04', en: "Make a decision.", ko: '결정해.' },
  { id: 'demo-05', en: "Get a feeling for it.", ko: '느낌을 익혀.' },
];

export function TodayScreen() {
  const sentence = useMemo(() => SAMPLE_SENTENCES[0], []);
  const speech = useSpeech({ lang: 'en' });
  const addXp = useStore((s) => s.addXp);
  const recordAnswer = useStore((s) => s.recordAnswer);
  const markStudyToday = useStore((s) => s.markStudyToday);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [showHint, setShowHint] = useState(false);

  const handleListen = useCallback(async () => {
    await speech.speak(sentence.en, 'en');
  }, [sentence, speech]);

  const handleSpeak = useCallback(async () => {
    setFeedback(null);
    await speech.startListening();
  }, [speech]);

  const handleResult = useCallback(() => {
    const result = speech.lastResult;
    if (!result || !result.text) {
      setFeedback({
        level: 'wrong',
        feedback: '응답이 인식되지 않았습니다. 다시 시도해 보세요.',
        canonicalTTS: sentence.en,
      });
      return;
    }

    const userTokens = result.text.toLowerCase().split(/\s+/).filter(Boolean);
    const expectedTokens = sentence.en.toLowerCase().split(/\s+/).filter(Boolean);
    const common = userTokens.filter((t) => expectedTokens.includes(t)).length;
    const similarity = expectedTokens.length > 0 ? common / expectedTokens.length : 0;

    let level: MatchLevel = 'wrong';
    let feedbackText = '다시 시도해 보세요.';
    if (similarity >= 0.95) {
      level = 'exact';
      feedbackText = '완벽합니다!';
    } else if (similarity >= 0.7) {
      level = 'fuzzy';
      feedbackText = '거의 다 됐어요! 이렇게도 해요.';
    }

    const isCorrect = level === 'exact' || level === 'fuzzy';
    if (isCorrect) {
      addXp(10);
      markStudyToday();
    } else {
      markStudyToday();
    }
    recordAnswer(isCorrect);
    setFeedback({ level, feedback: feedbackText, canonicalTTS: sentence.en });
  }, [sentence, speech, addXp, markStudyToday, recordAnswer]);

  const handleListenAgain = useCallback(async () => {
    if (feedback) {
      await speech.speak(feedback.canonicalTTS, 'en');
    }
  }, [feedback, speech]);

  const showResult = speech.lastResult && !feedback;
  const xpToast = feedback?.level === 'exact' ? <div className="xp-toast">+10 XP</div> : null;

  return (
    <div>
      {xpToast}
      <div className="progress-bar">
        <div className="fill" style={{ width: '20%' }} />
      </div>
      <Card className="sentence-card">
        <div>{sentence.en}</div>
        <div style={{ fontSize: '14px', color: 'var(--ebq-text-muted)', marginTop: '8px' }}>
          {sentence.ko}
        </div>
      </Card>
      <div className="action-row">
        <Button variant="primary" onClick={handleListen} disabled={speech.speaking}>
          ▶ 듣기
        </Button>
        <Button
          variant={speech.listening ? 'recording' : 'default'}
          onClick={handleSpeak}
          disabled={!speech.supported || speech.listening}
        >
          🎤 {speech.listening ? '말하는 중...' : '말하기'}
        </Button>
      </div>
      {!speech.supported && (
        <div style={{ color: 'var(--ebq-danger)', textAlign: 'center', fontSize: '12px' }}>
          이 브라우저는 음성 인식을 지원하지 않습니다. Chrome/Safari를 추천합니다.
        </div>
      )}
      {speech.error && (
        <div style={{ color: 'var(--ebq-danger)', textAlign: 'center', fontSize: '12px' }}>
          {speech.error}
        </div>
      )}
      {showResult && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '12px' }}>인식: "{speech.lastResult?.text}"</div>
          <Button onClick={handleResult}>결과 확인</Button>
        </div>
      )}
      {feedback && (
        <div className={`feedback ${feedback.level}`}>
          {feedback.feedback}
          <div style={{ marginTop: '12px' }}>
            <Button variant="primary" onClick={handleListenAgain}>
              원래 표현 듣기
            </Button>
          </div>
        </div>
      )}
      <div style={{ textAlign: 'center', marginTop: '16px' }}>
        <Button
          onClick={() => {
            setShowHint((v) => !v);
          }}
        >
          💬 힌트
        </Button>
        {showHint && (
          <Card style={{ marginTop: '12px' }}>
            <div>"grab" = 잡아채다</div>
            <div>"the ball" = 공</div>
          </Card>
        )}
      </div>
    </div>
  );
}
