/**
 * OpenRouterConfigCard — OpenRouter API 키 설정 카드.
 * 배포된 사이트(GitHub Pages)에서도 Grok 연동을 사용하기 위해 
 * 사용자가 직접 키를 입력하고 브라우저(localStorage)에 저장합니다.
 */
import { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

export function OpenRouterConfigCard() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // 저장된 키 로드
  useEffect(() => {
    const saved = localStorage.getItem('ebq_openrouter_key') || '';
    setApiKey(saved);
  }, []);

  const handleSave = () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      localStorage.removeItem('ebq_openrouter_key');
      setStatus('키가 삭제되었습니다.');
    } else {
      localStorage.setItem('ebq_openrouter_key', trimmed);
      setStatus('키가 저장되었습니다. 이제 Grok 조언을 사용할 수 있습니다.');
    }
    
    setTimeout(() => setStatus(null), 3000);
  };

  return (
    <Card style={{ marginTop: '12px' }}>
      <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>
        AI 설정 (OpenRouter / Grok)
      </div>
      <div style={{ fontSize: '13px', marginTop: '8px', lineHeight: 1.5 }}>
        GitHub Pages 주소에서도 Grok의 조언을 듣고 싶다면 본인의 OpenRouter API 키를 입력해 주세요.
        키는 브라우저에만 저장되며 서버로 전송되지 않습니다.
      </div>
      
      <div style={{ marginTop: '12px' }}>
        <input
          type={showKey ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-or-v1-..."
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '8px',
            border: '1px solid var(--ebq-border)',
            background: 'var(--ebq-surface-alt)',
            color: 'var(--ebq-text)',
            fontSize: '14px',
            boxSizing: 'border-box'
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
          <button
            onClick={() => setShowKey(!showKey)}
            style={{
              fontSize: '11px',
              color: 'var(--ebq-text-muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            {showKey ? '키 숨기기' : '키 보기'}
          </button>
          <Button variant="primary" onClick={handleSave}>저장</Button>
        </div>
      </div>

      {status && (
        <div style={{ 
          marginTop: '10px', 
          fontSize: '12px', 
          color: 'var(--ebq-primary)', 
          fontWeight: 600,
          textAlign: 'center'
        }}>
          {status}
        </div>
      )}

      <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--ebq-text-muted)' }}>
        * 키가 없으면 <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>openrouter.ai</a>에서 발급받으세요.
      </div>
    </Card>
  );
}
