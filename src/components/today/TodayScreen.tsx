/**
 * TodayScreen — Phase 2 세션 엔진 기반.
 * 한국어 먼저 보고 영어로 말하기 (핵심 학습 모델).
 *  - store.startSessionFromItems: 난이도 믹서 + SessionPlan 생성
 *  - store.recordTrial: 평가 → 보상(XP/콤보/배지) → 진행 갱신
 *  - store.nextSentence / endSession: 큐 진행 + 완료 요약
 * FeedbackBar + SessionComplete UI 통합.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useSpeech } from '../../hooks/useSpeech';
import { useStore } from '../../state/store';
import {
  loadStarterPack,
  loadCollocationsAsItems,
  loadPhrasalVerbsAsItems,
  loadAllGrammarAsItems,
} from '../../domain/content-loader';
import type { ContentItem } from '../../interfaces/ContentItem';
import type { MatchLevel } from '../../interfaces/Evaluator';
import FuzzyMatch from '../../domain/fuzzy-match';
import { FeedbackBar } from './FeedbackBar';
import { SessionComplete } from './SessionComplete';

const SESSION_SIZE = 10; // Phase 2 데모. 추후 50으로 확장.

/** 콘텐츠 팩 소스 — Phase 3 확장성. 새 팩 추가 시 여기만 갱신. */
interface PackSource {
  id: string;
  name: string;
  description: string;
  load: () => Promise<ContentItem[]>;
}

const PACK_SOURCES: PackSource[] = [
  {
    id: 'starter',
    name: '표현 스타터',
    description: '일상 표현 154개 — 기본',
    load: loadStarterPack,
  },
  {
    id: 'collocations',
    name: '코로케이션',
    description: '만능동사+명사 100개',
    load: loadCollocationsAsItems,
  },
  {
    id: 'phrasal-verbs',
    name: '구동사',
    description: '핵심 구동사 100개+',
    load: loadPhrasalVerbsAsItems,
  },
  {
    id: 'grammar',
    name: '그래머인유즈',
    description: '문법 유닛 10단원',
    load: loadAllGrammarAsItems,
  },
];

export function TodayScreen() {
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<string>('starter');
  const [packLoading, setPackLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showEnglish, setShowEnglish] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [pendingEval, setPendingEval] = useState<{
    level: MatchLevel;
    feedback: string;
    canonicalTTS: string;
    userText: string;
  } | null>(null);

  const speech = useSpeech({ lang: 'en' });

  // store — session engine
  const isPlaying = useStore((s) => s.isPlaying);
  const plan = useStore((s) => s.plan);
  const progress = useStore((s) => s.progress);
  const currentSentence = useStore((s) => s.currentSentence);
  const lastReward = useStore((s) => s.lastReward);
  const summary = useStore((s) => s.summary);
  const completionRewards = useStore((s) => s.completionRewards);

  const startSessionFromItems = useStore((s) => s.startSessionFromItems);
  const recordTrial = useStore((s) => s.recordTrial);
  const nextSentence = useStore((s) => s.nextSentence);
  const endSession = useStore((s) => s.endSession);
  const setActiveTab = useStore((s) => s.setActiveTab);

  // 시작 시 기본 starter pack 로드.
  useEffect(() => {
    let cancelled = false;
    setPackLoading(true);
    loadStarterPack()
      .then((loaded) => {
        if (cancelled) return;
        setItems(loaded);
        setPackLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError((err as Error).message);
        setPackLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 팩 선택 시 해당 팩 로드.
  const handleSelectPack = useCallback(async (packId: string) => {
    const source = PACK_SOURCES.find((p) => p.id === packId);
    if (!source) return;
    setSelectedPackId(packId);
    setPackLoading(true);
    setLoadError(null);
    try {
      const loaded = await source.load();
      setItems(loaded);
    } catch (err) {
      setLoadError((err as Error).message);
      setItems(null);
    }
    setPackLoading(false);
  }, []);

  const handleStart = useCallback(() => {
    if (!items || items.length === 0) return;
    setShowEnglish(false);
    setShowHint(false);
    setPendingEval(null);
    speech.reset();
    startSessionFromItems(items, { mode: 'translate', size: SESSION_SIZE });
  }, [items, startSessionFromItems, speech]);

  // 인식 결과가 들어오면 fuzzy-match로 평가 → store.recordTrial 호출.
  useEffect(() => {
    const result = speech.lastResult;
    if (!result || !currentSentence) return;
    if (pendingEval) return; // 이미 평가됨.

    const matched = FuzzyMatch.matchAnswer(result.text, currentSentence.en, {
      leniency: 1, // 초보자 관대
    });
    const level = matched.level as MatchLevel;
    const evalInfo = {
      level,
      feedback: matched.feedback,
      canonicalTTS: matched.canonicalTTS,
      userText: result.text,
    };
    setPendingEval(evalInfo);

    // SessionEvaluateResult 변환
    const matchKind: 'exact' | 'fuzzy' | 'wrong' | 'skipped' =
      level === 'exact' ? 'exact' : level === 'fuzzy' ? 'fuzzy' : 'wrong';
    const evaluation = {
      match: matchKind,
      score: matchKind === 'exact' ? 1 : matchKind === 'fuzzy' ? 0.7 : 0.2,
      feedback: matched.feedback,
      ttsContent: matched.canonicalTTS,
    };
    recordTrial(
      currentSentence,
      evaluation,
      { text: result.text, skipped: false }
    );
  }, [speech.lastResult, currentSentence, pendingEval, recordTrial]);

  // 스킵 처리
  const handleSkip = useCallback(() => {
    if (!currentSentence) return;
    setPendingEval({
      level: 'wrong',
      feedback: '스킵했어요.',
      canonicalTTS: currentSentence.en,
      userText: '',
    });
    recordTrial(
      currentSentence,
      { match: 'skipped', score: 0, feedback: '스킵', ttsContent: currentSentence.en },
      { skipped: true }
    );
  }, [currentSentence, recordTrial]);

  const handleListen = useCallback(async () => {
    if (!currentSentence) return;
    await speech.speak(currentSentence.en, 'en');
  }, [currentSentence, speech]);

  const handleSpeak = useCallback(() => {
    if (!currentSentence) return;
    setPendingEval(null);
    speech.startListening();
  }, [currentSentence, speech]);

  const handleListenOriginal = useCallback(async () => {
    if (!pendingEval) return;
    await speech.speak(pendingEval.canonicalTTS, 'en');
  }, [pendingEval, speech]);

  const handleNext = useCallback(() => {
    setPendingEval(null);
    setShowEnglish(false);
    setShowHint(false);
    speech.reset();
    // progress.index가 마지막이면 endSession 호출
    if (progress.finished) {
      endSession();
    } else {
      nextSentence();
    }
  }, [speech, progress.finished, nextSentence, endSession]);

  const handleReplay = useCallback(async () => {
    if (!currentSentence) return;
    await speech.speak(currentSentence.en, 'en');
  }, [currentSentence, speech]);

  const handleGoBrain = useCallback(() => {
    setActiveTab('brain');
  }, [setActiveTab]);

  // 로딩 상태
  if (loadError) {
    return (
      <Card>
        <div style={{ color: 'var(--ebq-danger)' }}>콘텐츠 로드 실패</div>
        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)', marginTop: '8px' }}>
          {loadError}
        </div>
      </Card>
    );
  }
  if (!items) {
    return <Card>불러오는 중…</Card>;
  }

  // 세션 시작 전 — 팩 선택 + 시작
  if (!isPlaying && !summary) {
    return (
      <Card style={{ padding: '20px' }}>
        <h2 style={{ marginTop: 0, textAlign: 'center' }}>오늘의 영어 뇌 훈련</h2>
        <p style={{ color: 'var(--ebq-text-muted)', fontSize: '13px', textAlign: 'center', margin: '4px 0 16px' }}>
          한국어 문장을 보고 영어로 말해 보세요.
          <br />
          {SESSION_SIZE}문장 세션 — 10% 도전, 80% 실력, 10% 쉬운 문장.
        </p>

        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)', marginBottom: '8px' }}>
          학습 팩 선택 ({items?.length ?? 0}문장)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          {PACK_SOURCES.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelectPack(p.id)}
              style={{
                padding: '10px',
                borderRadius: '12px',
                border: `1px solid ${selectedPackId === p.id ? 'var(--ebq-primary)' : 'var(--ebq-border)'}`,
                background: selectedPackId === p.id ? 'rgba(74,222,128,0.1)' : 'transparent',
                color: 'var(--ebq-text)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '14px' }}>{p.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--ebq-text-muted)', marginTop: '2px' }}>
                {p.description}
              </div>
            </button>
          ))}
        </div>

        {packLoading && (
          <div style={{ color: 'var(--ebq-text-muted)', textAlign: 'center', fontSize: '13px', marginBottom: '12px' }}>
            불러오는 중…
          </div>
        )}

        <Button
          variant="primary"
          onClick={handleStart}
          disabled={!items || items.length === 0 || packLoading}
          style={{ width: '100%' }}
        >
          🚀 세션 시작
        </Button>
      </Card>
    );
  }

  // 세션 완료 요약
  if (summary && completionRewards) {
    // 새 배지 — 이번 세션에서 획득한 것 (간이: 마지막 세션의 completionRewards.badges + 이전 대비 증가분은 store가 관리)
    const newBadges = completionRewards.badges;
    return (
      <SessionComplete
        summary={summary}
        rewards={completionRewards}
        newBadges={newBadges}
        onRestart={handleStart}
        onGoBrain={handleGoBrain}
      />
    );
  }

  // 세션 진행 중 — 현재 문장이 없으면(안전) 시작 화면
  if (!currentSentence || !plan) {
    return (
      <Card style={{ textAlign: 'center' }}>
        <div>세션 준비 중…</div>
        <Button variant="primary" onClick={handleStart} style={{ marginTop: '12px' }}>
          다시 시작
        </Button>
      </Card>
    );
  }

  const progressPct = Math.round(((progress.index) / plan.total) * 100);
  const tierLabel =
    currentSentence.difficulty === 'challenge'
      ? '🔥 도전'
      : currentSentence.difficulty === 'easy'
      ? '🌱 쉬운'
      : '보통';

  return (
    <div>
      {/* 진행 바 */}
      <div className="progress-bar">
        <div className="fill" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="session-progress-strip">
        <span>{progress.index + 1} / {plan.total}</span>
        <span>•</span>
        <span>🎯 {progress.correct}</span>
        <span>✨ {progress.fuzzy}</span>
        <span>❌ {progress.wrong}</span>
        <span className="tier-chip ${currentSentence.difficulty || ''}">
          {tierLabel}
        </span>
        {progress.combo >= 3 && (
          <span className="combo-chip">🔥 {progress.combo}콤보</span>
        )}
      </div>

      {/* 문장 카드 — 한국어 먼저 */}
      <Card className="sentence-card">
        <div style={{ fontSize: '22px', lineHeight: 1.4, fontWeight: 600 }}>
          {currentSentence.ko}
        </div>
        {showEnglish && (
          <div
            style={{
              fontSize: '18px',
              color: 'var(--ebq-text-muted)',
              marginTop: '10px',
              lineHeight: 1.4,
            }}
          >
            {currentSentence.en}
          </div>
        )}
        {!showEnglish && (
          <div
            style={{
              fontSize: '12px',
              color: 'var(--ebq-text-muted)',
              marginTop: '10px',
            }}
          >
            영어로 말해 보세요. (정답 보려면 아래 '한→영' 버튼)
          </div>
        )}
      </Card>

      {/* 액션 버튼 */}
      <div className="action-row">
        <Button
          variant="primary"
          onClick={handleListen}
          disabled={speech.speaking}
          title="정답 영어 들리기"
        >
          🔊 정답 듣기
        </Button>
        <Button
          variant={speech.listening ? 'recording' : 'default'}
          onClick={handleSpeak}
          disabled={!speech.supported || speech.listening || !!pendingEval}
        >
          🎤 {speech.listening ? '말하는 중...' : '영어로 말하기'}
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
      {speech.lastResult && !pendingEval && (
        <div style={{ textAlign: 'center', fontSize: '14px', marginTop: '12px' }}>
          인식: &quot;{speech.lastResult.text}&quot;
        </div>
      )}

      {/* 피드백 바 — trial 평가 후 */}
      {pendingEval && lastReward && (
        <>
          <FeedbackBar
            evaluation={{
              match:
                pendingEval.level === 'exact'
                  ? 'exact'
                  : pendingEval.level === 'fuzzy'
                  ? 'fuzzy'
                  : pendingEval.level === 'wrong'
                  ? 'wrong'
                  : 'skipped',
              score: 1,
              feedback: pendingEval.feedback,
              ttsContent: pendingEval.canonicalTTS,
            }}
            reward={lastReward}
            combo={progress.combo}
          />
          {pendingEval.userText && (
            <div
              style={{
                fontSize: '12px',
                color: 'var(--ebq-text-muted)',
                textAlign: 'center',
                marginTop: '4px',
              }}
            >
              네가 말한 것: &quot;{pendingEval.userText}&quot;
            </div>
          )}
          <div
            style={{
              marginTop: '12px',
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <Button variant="primary" onClick={handleListenOriginal}>
              원래 표현 듣기
            </Button>
            <Button onClick={handleNext}>다음 →</Button>
          </div>
        </>
      )}

      {/* 보조 버튼 */}
      <div className="toggle-row">
        <Button
          onClick={() => setShowEnglish((v) => !v)}
          variant={showEnglish ? 'primary' : 'default'}
          className="toggle-btn"
        >
          {showEnglish ? '🇰🇷 한국어만' : '🇺🇸 한→영 토글'}
        </Button>
        <Button
          onClick={() => setShowHint((v) => !v)}
          variant={showHint ? 'primary' : 'default'}
          className="toggle-btn"
        >
          💬 힌트
        </Button>
        <Button
          onClick={handleReplay}
          disabled={speech.speaking}
          className="toggle-btn"
        >
          🔄 다시 듣기
        </Button>
        <Button onClick={handleSkip} className="toggle-btn">
          ⏭️ 스킵
        </Button>
      </div>

      {showHint && currentSentence.hints && (
        <Card style={{ marginTop: '12px' }}>
          {currentSentence.hints.map((h, i) => (
            <div key={i} style={{ padding: '4px 0', fontSize: '14px' }}>
              • {h}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
