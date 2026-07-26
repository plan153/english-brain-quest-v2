import { Card } from '../ui/Card';

const STARTER_VERBS = [
  { verb: 'have', mastery: 80 },
  { verb: 'get', mastery: 60 },
  { verb: 'take', mastery: 30 },
  { verb: 'want', mastery: 20 },
  { verb: 'need', mastery: 15 },
  { verb: 'be', mastery: 10 },
  { verb: 'do', mastery: 5 },
  { verb: 'feel', mastery: 0 },
];

const SAMPLE_EXPRESSIONS = [
  { id: 'e01', en: 'grab the ball', status: 'mastered' as const },
  { id: 'e02', en: 'make a decision', status: 'practice' as const },
  { id: 'e03', en: 'take a chance', status: 'new' as const },
];

export function DictionaryScreen() {
  return (
    <div>
      <Card>
        <div style={{ fontWeight: 700, marginBottom: '12px' }}>만능동사</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {STARTER_VERBS.map((v) => (
            <div
              key={v.verb}
              className="card"
              style={{
                padding: '12px 4px',
                textAlign: 'center',
                fontSize: '14px',
                opacity: v.mastery === 0 ? 0.5 : 1,
              }}
            >
              <div style={{ fontWeight: 700 }}>{v.verb}</div>
              <div style={{ fontSize: '11px', color: 'var(--ebq-text-muted)' }}>
                {v.mastery === 0 ? '🔒' : `${v.mastery}%`}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card style={{ marginTop: '12px' }}>
        <div style={{ fontWeight: 700, marginBottom: '12px' }}>표현 라이브러리</div>
        {SAMPLE_EXPRESSIONS.map((e) => (
          <div
            key={e.id}
            style={{
              padding: '12px 0',
              borderTop: '1px solid var(--ebq-border)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{e.en}</span>
            <span style={{ color: 'var(--ebq-text-muted)', fontSize: '12px' }}>
              {e.status === 'mastered' && '★ 마스터'}
              {e.status === 'practice' && '🔨 연습'}
              {e.status === 'new' && '📚 새것'}
            </span>
          </div>
        ))}
      </Card>
      <Card style={{ marginTop: '12px' }}>
        <div style={{ fontWeight: 700, marginBottom: '12px' }}>코로케이션</div>
        <div style={{ color: 'var(--ebq-text-muted)', fontSize: '14px' }}>
          100개 카탈로그 (Phase 1에서 채워지는 중)
        </div>
      </Card>
      <Card style={{ marginTop: '12px' }}>
        <div style={{ fontWeight: 700, marginBottom: '12px' }}>구동사</div>
        <div style={{ color: 'var(--ebq-text-muted)', fontSize: '14px' }}>
          50개 (10개 그룹)
        </div>
      </Card>
    </div>
  );
}
