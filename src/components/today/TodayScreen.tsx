/**
 * TodayScreen — Phase 2 세션 엔진 기반.
 * 한국어 먼저 보고 영어로 말하기 (핵심 학습 모델).
 *  - store.startSessionFromItems: 난이도 믹서 + SessionPlan 생성
 *  - store.recordTrial: 평가 → 보상(XP/콤보/배지) → 진행 갱신
 *  - store.nextSentence / endSession: 큐 진행 + 완료 요약
 * FeedbackBar + SessionComplete UI 통합.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { KoPrompt } from '../ui/KoPrompt';
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
import type { SpeechResult } from '../../interfaces/SpeechResult';
import FuzzyMatch from '../../domain/fuzzy-match';
import {
  PATTERN_NOTE_IDS,
  patternNoteTitle,
  type GapSlotRole,
} from '../../domain/gap-reason';
import { FeedbackBar } from './FeedbackBar';
import { GapReasonCard } from './GapReasonCard';
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
    id: 'weak',
    name: '약점 강화',
    description: '오답·힌트 의존 · 볼트 Gap',
    load: async () => [],
  },
  {
    id: 'pattern',
    name: '패턴 약점',
    description: '주어·동사·시제·3sg 등 슬롯',
    load: async () => [],
  },
  {
    id: 'review',
    name: '복습',
    description: '기한 도래 · 내 문장 우선',
    load: async () => [], // store에서 채움
  },
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
  const [selectedPackId, setSelectedPackId] = useState<string>('weak');
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
  const [typeDraft, setTypeDraft] = useState('');
  const [showTypeInput, setShowTypeInput] = useState(false);

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
  const getGapForSentence = useStore((s) => s.getGapForSentence);
  const resolveGapReason = useStore((s) => s.resolveGapReason);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const getDueReviewItems = useStore((s) => s.getDueReviewItems);
  const dueReviewCount = useStore((s) => s.dueReviewCount);
  const getWeakTrainingItems = useStore((s) => s.getWeakTrainingItems);
  const weakTrainingCount = useStore((s) => s.weakTrainingCount);
  const getPatternTrainingItems = useStore((s) => s.getPatternTrainingItems);
  const patternTrainingCount = useStore((s) => s.patternTrainingCount);
  const getPatternSummary = useStore((s) => s.getPatternSummary);
  const selectedPatternRole = useStore((s) => s.selectedPatternRole);
  const setSelectedPatternRole = useStore((s) => s.setSelectedPatternRole);
  const consumePendingStartPack = useStore((s) => s.consumePendingStartPack);

  const currentSentenceRef = useRef(currentSentence);
  const pendingEvalRef = useRef(pendingEval);
  const heardAnswerRef = useRef(false);
  const sawEnglishRef = useRef(false);
  currentSentenceRef.current = currentSentence;
  pendingEvalRef.current = pendingEval;

  const resetCueFlags = useCallback(() => {
    heardAnswerRef.current = false;
    sawEnglishRef.current = false;
  }, []);

  const resolveCueMode = useCallback((): 'blind' | 'after_listen' | 'after_reveal' => {
    if (sawEnglishRef.current) return 'after_reveal';
    if (heardAnswerRef.current) return 'after_listen';
    return 'blind';
  }, []);

  /** 말하기·타이핑 공통 채점 */
  const submitAnswer = useCallback(
    (text: string, inputMode: 'speak' | 'type') => {
      const sentence = currentSentenceRef.current;
      if (!sentence || pendingEvalRef.current) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      const matched = FuzzyMatch.matchAnswer(trimmed, sentence.en, {
        leniency: 1,
      });
      const level = matched.level as MatchLevel;
      const evalInfo = {
        level,
        feedback: matched.feedback,
        canonicalTTS: matched.canonicalTTS,
        userText: trimmed,
      };
      pendingEvalRef.current = evalInfo;
      setPendingEval(evalInfo);
      setTypeDraft('');

      const matchKind: 'exact' | 'fuzzy' | 'wrong' | 'skipped' =
        level === 'exact' ? 'exact' : level === 'fuzzy' ? 'fuzzy' : 'wrong';
      recordTrial(
        sentence,
        {
          match: matchKind,
          score: matchKind === 'exact' ? 1 : matchKind === 'fuzzy' ? 0.7 : 0.2,
          feedback: matched.feedback,
          ttsContent: matched.canonicalTTS,
        },
        { text: trimmed, skipped: false, cueMode: resolveCueMode(), inputMode }
      );
    },
    [recordTrial, resolveCueMode]
  );

  /** STT final → 즉시 채점 */
  const handleSpeechResult = useCallback(
    (result: SpeechResult) => {
      if (!result.text.trim()) return;
      submitAnswer(result.text, 'speak');
    },
    [submitAnswer]
  );

  const handleTypeSubmit = useCallback(() => {
    submitAnswer(typeDraft, 'type');
  }, [submitAnswer, typeDraft]);

  const speech = useSpeech({ lang: 'en', onResult: handleSpeechResult, maxListenMs: 7000 });

  // 시작 시 약점 큐가 있으면 약점 팩, 없으면 스타터.
  useEffect(() => {
    let cancelled = false;
    setPackLoading(true);
    void (async () => {
      try {
        const weak = getWeakTrainingItems(SESSION_SIZE);
        if (!cancelled && weak.length > 0) {
          setSelectedPackId('weak');
          setItems(weak);
          setPackLoading(false);
          return;
        }
        const loaded = await loadStarterPack();
        if (cancelled) return;
        setSelectedPackId('starter');
        setItems(loaded);
        setPackLoading(false);
      } catch (err) {
        if (cancelled) return;
        setLoadError((err as Error).message);
        setPackLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getWeakTrainingItems]);

  // 팩 선택 시 해당 팩 로드.
  const handleSelectPack = useCallback(async (packId: string) => {
    const source = PACK_SOURCES.find((p) => p.id === packId);
    if (!source) return;
    setSelectedPackId(packId);
    setPackLoading(true);
    setLoadError(null);
    try {
      let loaded: ContentItem[];
      if (packId === 'weak') {
        loaded = getWeakTrainingItems(SESSION_SIZE);
      } else if (packId === 'pattern') {
        loaded = getPatternTrainingItems(SESSION_SIZE, selectedPatternRole);
      } else if (packId === 'review') {
        loaded = getDueReviewItems(SESSION_SIZE);
      } else {
        loaded = await source.load();
      }
      setItems(loaded);
      if (packId === 'weak' && loaded.length === 0) {
        setLoadError(
          '약점 큐가 비어 있어요. 학습 후 오답이 쌓이거나, Brain에서 볼트 Gaps를 불러오세요.'
        );
      }
      if (packId === 'pattern' && loaded.length === 0) {
        setLoadError(
          '패턴 Gap이 없어요. 문장을 틀리면 주어·동사·시제 등 슬롯이 쌓인 뒤 여기에 나타납니다.'
        );
      }
      if (packId === 'review' && loaded.length === 0) {
        setLoadError('복습 대기 문장이 없어요. 먼저 다른 팩으로 학습해 보세요.');
      }
    } catch (err) {
      setLoadError((err as Error).message);
      setItems(null);
    }
    setPackLoading(false);
  }, [
    getDueReviewItems,
    getWeakTrainingItems,
    getPatternTrainingItems,
    selectedPatternRole,
  ]);

  // Brain「약점 강화」CTA → 자동 시작
  useEffect(() => {
    if (isPlaying || summary) return;
    const pack = consumePendingStartPack();
    if (!pack) return;
    void (async () => {
      await handleSelectPack(pack);
      const itemsNow =
        pack === 'weak'
          ? getWeakTrainingItems(SESSION_SIZE)
          : pack === 'pattern'
            ? getPatternTrainingItems(SESSION_SIZE)
            : pack === 'review'
              ? getDueReviewItems(SESSION_SIZE)
              : null;
      if (itemsNow && itemsNow.length > 0) {
        setShowEnglish(false);
        setShowHint(false);
        setShowTypeInput(false);
        setTypeDraft('');
        pendingEvalRef.current = null;
        setPendingEval(null);
        resetCueFlags();
        speech.reset();
        startSessionFromItems(itemsNow, { mode: 'translate', size: SESSION_SIZE });
      }
    })();
  }, [
    isPlaying,
    summary,
    consumePendingStartPack,
    handleSelectPack,
    getWeakTrainingItems,
    getPatternTrainingItems,
    getDueReviewItems,
    resetCueFlags,
    speech,
    startSessionFromItems,
  ]);

  const handleStart = useCallback(() => {
    if (!items || items.length === 0) return;
    setShowEnglish(false);
    setShowHint(false);
    setShowTypeInput(false);
    setTypeDraft('');
    pendingEvalRef.current = null;
    setPendingEval(null);
    resetCueFlags();
    speech.reset();
    startSessionFromItems(items, { mode: 'translate', size: SESSION_SIZE });
  }, [items, startSessionFromItems, speech, resetCueFlags]);

  // 스킵 처리
  const handleSkip = useCallback(() => {
    if (!currentSentence) return;
    const evalInfo = {
      level: 'wrong' as MatchLevel,
      feedback: '스킵했어요.',
      canonicalTTS: currentSentence.en,
      userText: '',
    };
    pendingEvalRef.current = evalInfo;
    setPendingEval(evalInfo);
    recordTrial(
      currentSentence,
      { match: 'skipped', score: 0, feedback: '스킵', ttsContent: currentSentence.en },
      { skipped: true, cueMode: resolveCueMode() }
    );
  }, [currentSentence, recordTrial, resolveCueMode]);

  const handleListen = useCallback(async () => {
    if (!currentSentence) return;
    heardAnswerRef.current = true;
    await speech.speak(currentSentence.en, 'en');
  }, [currentSentence, speech]);

  const handleSpeak = useCallback(() => {
    if (!currentSentence) return;
    pendingEvalRef.current = null;
    setPendingEval(null);
    speech.reset();
    speech.startListening();
  }, [currentSentence, speech]);

  const handleListenOriginal = useCallback(async () => {
    if (!pendingEval) return;
    heardAnswerRef.current = true;
    await speech.speak(pendingEval.canonicalTTS, 'en');
  }, [pendingEval, speech]);

  const handleNext = useCallback(() => {
    pendingEvalRef.current = null;
    setPendingEval(null);
    setShowEnglish(false);
    setShowHint(false);
    setShowTypeInput(false);
    setTypeDraft('');
    resetCueFlags();
    speech.reset();
    const done =
      !!plan && progress.index >= plan.total && progress.completed >= plan.total;
    if (done) {
      endSession();
    } else {
      nextSentence();
    }
  }, [speech, progress.index, progress.completed, plan, nextSentence, endSession, resetCueFlags]);

  const handleReplay = useCallback(async () => {
    if (!currentSentence) return;
    heardAnswerRef.current = true;
    await speech.speak(currentSentence.en, 'en');
  }, [currentSentence, speech]);

  const handleGoBrain = useCallback(() => {
    setActiveTab('brain');
  }, [setActiveTab]);

  const openTodayLog = useStore((s) => s.openTodayLog);
  const todayLogCount = useStore((s) => s.todayLog.length);

  const handleGoTodayLog = useCallback(() => {
    openTodayLog();
  }, [openTodayLog]);

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
          {PACK_SOURCES.map((p) => {
            const badge =
              p.id === 'weak'
                ? weakTrainingCount()
                : p.id === 'pattern'
                  ? patternTrainingCount()
                  : p.id === 'review'
                    ? dueReviewCount()
                    : null;
            return (
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
              <div style={{ fontWeight: 700, fontSize: '14px' }}>
                {p.name}
                {badge !== null ? ` (${badge})` : ''}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--ebq-text-muted)', marginTop: '2px' }}>
                {p.description}
              </div>
            </button>
            );
          })}
        </div>

        {selectedPackId === 'pattern' && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)', marginBottom: '8px' }}>
              슬롯 필터 (비우면 가장 많은 패턴부터)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <button
                type="button"
                onClick={() => {
                  setSelectedPatternRole(null);
                  void handleSelectPack('pattern');
                }}
                style={{
                  padding: '6px 10px',
                  borderRadius: '999px',
                  border: `1px solid ${selectedPatternRole == null ? 'var(--ebq-accent)' : 'var(--ebq-border)'}`,
                  background:
                    selectedPatternRole == null ? 'rgba(96,165,250,0.15)' : 'transparent',
                  color: 'var(--ebq-text)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                자동
              </button>
              {PATTERN_NOTE_IDS.map((role: GapSlotRole) => {
                const row = getPatternSummary().find((r) => r.role === role);
                const n = row?.sentenceCount ?? 0;
                return (
                  <button
                    key={role}
                    type="button"
                    disabled={n === 0}
                    onClick={() => {
                      setSelectedPatternRole(role);
                      void (async () => {
                        setSelectedPackId('pattern');
                        setPackLoading(true);
                        setLoadError(null);
                        const loaded = getPatternTrainingItems(SESSION_SIZE, role);
                        setItems(loaded);
                        if (loaded.length === 0) {
                          setLoadError('이 슬롯에 쌓인 Gap이 없어요.');
                        }
                        setPackLoading(false);
                      })();
                    }}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '999px',
                      border: `1px solid ${selectedPatternRole === role ? 'var(--ebq-accent)' : 'var(--ebq-border)'}`,
                      background:
                        selectedPatternRole === role ? 'rgba(96,165,250,0.15)' : 'transparent',
                      color: n === 0 ? 'var(--ebq-text-muted)' : 'var(--ebq-text)',
                      fontSize: '12px',
                      cursor: n === 0 ? 'not-allowed' : 'pointer',
                      opacity: n === 0 ? 0.5 : 1,
                    }}
                  >
                    {patternNoteTitle(role)}
                    {n > 0 ? ` ${n}` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
        {todayLogCount > 0 && (
          <button
            type="button"
            onClick={handleGoTodayLog}
            style={{
              display: 'block',
              width: '100%',
              marginTop: '12px',
              padding: '10px',
              background: 'transparent',
              border: '1px solid var(--ebq-border)',
              borderRadius: '12px',
              color: 'var(--ebq-text)',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            오늘 만난 문장 {todayLogCount}개 보기 →
          </button>
        )}
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
        onGoTodayLog={handleGoTodayLog}
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

  const sentenceOrdinal = plan.sentences.findIndex((s) => s.id === currentSentence.id);
  const displayNum = sentenceOrdinal >= 0 ? sentenceOrdinal + 1 : progress.completed + 1;
  const progressPct = Math.round((progress.completed / plan.total) * 100);
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
        <span>{displayNum} / {plan.total}</span>
        <span>•</span>
        <span>🎯 {progress.correct}</span>
        <span>✨ {progress.fuzzy}</span>
        <span>❌ {progress.wrong}</span>
        <span className={`tier-chip ${currentSentence.difficulty || ''}`}>
          {tierLabel}
        </span>
        {progress.combo >= 3 && (
          <span className="combo-chip">🔥 {progress.combo}콤보</span>
        )}
      </div>

      {/* 문장 카드 — 한국어 먼저 */}
      <Card key={currentSentence.id} className="sentence-card">
        <KoPrompt text={currentSentence.ko} />
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
            영어로 말하거나 타이핑해 보세요. (정답 보려면 아래 &apos;한→영&apos; 버튼)
          </div>
        )}
      </Card>

      {/* 액션 버튼 */}
      <div className="action-row">
        <Button
          variant="primary"
          className={speech.speaking ? 'playing' : ''}
          onClick={handleListen}
          disabled={speech.speaking}
          title="정답 영어 들리기"
        >
          {speech.speaking ? '🔊 재생 중…' : '🔊 정답 듣기'}
        </Button>
        <Button
          variant={speech.listening ? 'recording' : pendingEval ? 'primary' : 'default'}
          onClick={handleSpeak}
          disabled={!speech.supported || speech.listening || speech.speaking}
        >
          🎤{' '}
          {speech.listening
            ? '말하는 중...'
            : pendingEval
              ? '다시 말하기'
              : '영어로 말하기'}
        </Button>
        <Button
          onClick={() => {
            setShowTypeInput((v) => !v);
            if (speech.listening) speech.stopListening();
          }}
          disabled={!!pendingEval || speech.listening}
          className={showTypeInput ? 'active' : ''}
        >
          ⌨️ 타이핑
        </Button>
      </div>

      {showTypeInput && !pendingEval && (
        <Card style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)', marginBottom: '8px' }}>
            영어로 입력 후 제출 (말하기와 같은 채점)
          </div>
          <input
            type="text"
            value={typeDraft}
            onChange={(e) => setTypeDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleTypeSubmit();
              }
            }}
            placeholder="Type the English sentence…"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid var(--ebq-border)',
              background: 'var(--ebq-surface-alt)',
              color: 'var(--ebq-text)',
              fontSize: '16px',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <Button
            variant="primary"
            onClick={handleTypeSubmit}
            disabled={!typeDraft.trim()}
            style={{ width: '100%', marginTop: '10px' }}
          >
            제출
          </Button>
        </Card>
      )}

      {!speech.supported && (
        <div style={{ color: 'var(--ebq-danger)', textAlign: 'center', fontSize: '12px' }}>
          이 브라우저는 음성 인식을 지원하지 않습니다. Chrome/Safari를 추천합니다. 타이핑으로도 연습할 수 있어요.
        </div>
      )}
      {speech.error && (
        <div style={{ color: 'var(--ebq-danger)', textAlign: 'center', fontSize: '12px' }}>
          {speech.error}
        </div>
      )}
      {speech.listening && speech.interimText && (
        <div style={{ textAlign: 'center', fontSize: '14px', marginTop: '12px', color: 'var(--ebq-text-muted)' }}>
          듣는 중: &quot;{speech.interimText}&quot;
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
              네가 쓴/말한 것: &quot;{pendingEval.userText}&quot;
            </div>
          )}
          {pendingEval.level === 'wrong' &&
            currentSentence &&
            (() => {
              const gap = getGapForSentence(currentSentence.id);
              if (!gap) return null;
              return (
                <GapReasonCard
                  gap={gap}
                  onConfirm={(id) => resolveGapReason(id, { type: 'confirmed' })}
                  onSaveEdit={(id, reason) =>
                    resolveGapReason(id, { type: 'edited', reason })
                  }
                />
              );
            })()}
          <div
            style={{
              marginTop: '12px',
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <Button
              variant="primary"
              className={speech.speaking ? 'playing' : ''}
              onClick={handleListenOriginal}
              disabled={speech.speaking}
            >
              {speech.speaking ? '재생 중…' : '원래 표현 듣기'}
            </Button>
            <Button
              onClick={handleSpeak}
              disabled={!speech.supported || speech.listening || speech.speaking}
            >
              다시 말하기
            </Button>
            <Button
              onClick={() => {
                pendingEvalRef.current = null;
                setPendingEval(null);
                setShowTypeInput(true);
                setTypeDraft('');
              }}
            >
              다시 타이핑
            </Button>
            <Button onClick={handleNext}>다음 →</Button>
          </div>
        </>
      )}

      {/* 보조 버튼 */}
      <div className="toggle-row">
        <Button
          onClick={() => {
            setShowEnglish((v) => {
              const next = !v;
              if (next) sawEnglishRef.current = true;
              return next;
            });
          }}
          className={`toggle-btn${showEnglish ? ' active' : ''}`}
        >
          {showEnglish ? '🇰🇷 한국어만' : '🇺🇸 한→영 토글'}
        </Button>
        <Button
          onClick={() => setShowHint((v) => !v)}
          className={`toggle-btn${showHint ? ' active' : ''}`}
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
