/** 한국어 프롬프트 — 괄호 의미 단서는 흐리게 표시 */
export function KoPrompt({ text, size = 22 }: { text: string; size?: number }) {
  const m = text.match(/^(.*?)\s*(\([^)]+\))\s*$/u);
  const main = m ? m[1].trim() : text;
  const gloss = m?.[2];

  return (
    <div style={{ fontSize: size, lineHeight: 1.4, fontWeight: 600 }}>
      <span>{main}</span>
      {gloss && (
        <span
          style={{
            display: 'block',
            marginTop: 6,
            fontSize: Math.max(12, Math.round(size * 0.55)),
            fontWeight: 500,
            color: 'var(--ebq-text-muted)',
            lineHeight: 1.35,
          }}
        >
          {gloss}
        </span>
      )}
    </div>
  );
}
