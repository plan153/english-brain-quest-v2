/**
 * DictionaryScreen — 사전 화면.
 * 만능동사 / 표현 / 코로케이션 / 구동사 + 검색.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card } from '../ui/Card';
import {
  loadCollocations,
  loadPhrasalVerbs,
  loadStarterPack,
} from '../../domain/content-loader';
import type { Collocation, PhrasalVerb } from '../../domain/content-loader';
import type { ContentItem, SentenceExpression } from '../../interfaces/ContentItem';

interface CanonVerb {
  id: string;
  word: string;
  coreImage: string;
  easyKorean: string;
  representativeSituations: string[];
  level: number;
}

const CANON_BASE = `${import.meta.env.BASE_URL}data`.replace(/\/?$/, '');

async function loadVerbs(): Promise<CanonVerb[]> {
  const res = await fetch(`${CANON_BASE}/verbs.json`);
  if (!res.ok) throw new Error(`Failed to load verbs: ${res.status}`);
  return res.json();
}

type Section = 'verbs' | 'expressions' | 'collocations' | 'phrasal';

function matchesQuery(text: string, q: string): boolean {
  if (!q) return true;
  return text.toLowerCase().includes(q.toLowerCase());
}

export function DictionaryScreen() {
  const [verbs, setVerbs] = useState<CanonVerb[] | null>(null);
  const [expressions, setExpressions] = useState<ContentItem[] | null>(null);
  const [collocations, setCollocations] = useState<Collocation[] | null>(null);
  const [phrasalVerbs, setPhrasalVerbs] = useState<PhrasalVerb[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('verbs');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadVerbs(), loadStarterPack(), loadCollocations(), loadPhrasalVerbs()])
      .then(([v, e, c, p]) => {
        if (cancelled) return;
        setVerbs(v);
        setExpressions(e);
        setCollocations(c);
        setPhrasalVerbs(p);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredVerbs = useMemo(
    () =>
      (verbs ?? []).filter(
        (v) =>
          matchesQuery(v.word, query) ||
          matchesQuery(v.easyKorean, query) ||
          matchesQuery(v.coreImage, query)
      ),
    [verbs, query]
  );

  const filteredExpressions = useMemo(
    () =>
      (expressions ?? []).filter((item) => {
        const data = item.data as SentenceExpression;
        return (
          matchesQuery(data.en ?? '', query) ||
          matchesQuery(item.translations?.ko ?? '', query)
        );
      }),
    [expressions, query]
  );

  const filteredCols = useMemo(
    () =>
      (collocations ?? []).filter(
        (c) =>
          matchesQuery(c.en, query) ||
          matchesQuery(c.ko, query) ||
          matchesQuery(c.pattern, query)
      ),
    [collocations, query]
  );

  const filteredPv = useMemo(
    () =>
      (phrasalVerbs ?? []).filter(
        (p) =>
          matchesQuery(`${p.verb} ${p.particle}`, query) ||
          matchesQuery(p.en, query) ||
          matchesQuery(p.ko, query)
      ),
    [phrasalVerbs, query]
  );

  if (error) {
    return (
      <Card>
        <div style={{ color: 'var(--ebq-danger)' }}>사전 로드 실패</div>
        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)', marginTop: '8px' }}>
          {error}
        </div>
      </Card>
    );
  }

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="검색 (영어/한국어)"
        style={{
          width: '100%',
          padding: '10px 12px',
          marginBottom: '10px',
          borderRadius: '12px',
          border: '1px solid var(--ebq-border)',
          background: 'var(--ebq-surface)',
          color: 'var(--ebq-text)',
          fontSize: '14px',
        }}
      />

      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px' }}>
        <TabButton active={section === 'verbs'} onClick={() => setSection('verbs')}>
          만능동사
        </TabButton>
        <TabButton active={section === 'expressions'} onClick={() => setSection('expressions')}>
          표현
        </TabButton>
        <TabButton active={section === 'collocations'} onClick={() => setSection('collocations')}>
          코로케이션
        </TabButton>
        <TabButton active={section === 'phrasal'} onClick={() => setSection('phrasal')}>
          구동사
        </TabButton>
      </div>

      {section === 'verbs' && (
        <Card>
          <div style={{ fontWeight: 700, marginBottom: '12px' }}>
            만능동사 ({filteredVerbs.length})
          </div>
          {!verbs ? (
            <div style={{ color: 'var(--ebq-text-muted)' }}>불러오는 중…</div>
          ) : filteredVerbs.length === 0 ? (
            <div style={{ color: 'var(--ebq-text-muted)' }}>검색 결과 없음</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {filteredVerbs.map((v) => (
                <div key={v.id} className="card" style={{ padding: '10px', fontSize: '13px' }}>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{v.word}</div>
                  <div style={{ color: 'var(--ebq-text-muted)', marginTop: '4px' }}>
                    {v.coreImage}
                  </div>
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>{v.easyKorean}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {section === 'expressions' && (
        <Card>
          <div style={{ fontWeight: 700, marginBottom: '12px' }}>
            표현 ({filteredExpressions.length})
          </div>
          {!expressions ? (
            <div style={{ color: 'var(--ebq-text-muted)' }}>불러오는 중…</div>
          ) : filteredExpressions.length === 0 ? (
            <div style={{ color: 'var(--ebq-text-muted)' }}>검색 결과 없음</div>
          ) : (
            filteredExpressions.slice(0, 80).map((item) => {
              const data = item.data as SentenceExpression;
              return (
                <div
                  key={item.id}
                  style={{ padding: '10px 0', borderTop: '1px solid var(--ebq-border)' }}
                >
                  <div style={{ fontWeight: 600 }}>{data.en}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>
                    {item.translations?.ko}
                  </div>
                </div>
              );
            })
          )}
        </Card>
      )}

      {section === 'collocations' && (
        <Card>
          <div style={{ fontWeight: 700, marginBottom: '12px' }}>
            코로케이션 ({filteredCols.length})
          </div>
          {!collocations ? (
            <div style={{ color: 'var(--ebq-text-muted)' }}>불러오는 중…</div>
          ) : filteredCols.length === 0 ? (
            <div style={{ color: 'var(--ebq-text-muted)' }}>검색 결과 없음</div>
          ) : (
            filteredCols.map((c) => (
              <div
                key={c.id}
                style={{ padding: '10px 0', borderTop: '1px solid var(--ebq-border)' }}
              >
                <div style={{ fontWeight: 600 }}>{c.pattern}</div>
                <div style={{ fontSize: '13px', marginTop: '2px' }}>{c.en}</div>
                <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>{c.ko}</div>
              </div>
            ))
          )}
        </Card>
      )}

      {section === 'phrasal' && (
        <Card>
          <div style={{ fontWeight: 700, marginBottom: '12px' }}>
            구동사 ({filteredPv.length})
          </div>
          {!phrasalVerbs ? (
            <div style={{ color: 'var(--ebq-text-muted)' }}>불러오는 중…</div>
          ) : filteredPv.length === 0 ? (
            <div style={{ color: 'var(--ebq-text-muted)' }}>검색 결과 없음</div>
          ) : (
            filteredPv.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: '10px 0',
                  borderTop: '1px solid var(--ebq-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {p.verb} {p.particle}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>{p.en}</div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)', textAlign: 'right' }}>
                  {p.ko}
                </div>
              </div>
            ))
          )}
        </Card>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px',
        borderRadius: '99px',
        border: '1px solid var(--ebq-border)',
        background: active ? 'var(--ebq-accent)' : 'transparent',
        color: active ? '#fff' : 'var(--ebq-text)',
        fontWeight: 600,
        fontSize: '13px',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
