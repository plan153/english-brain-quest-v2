/**
 * grok.ts — OpenRouter를 통한 xAI (Grok) API 어댑터.
 * 한국 IP 차단을 우회하여 Grok 모델을 호출합니다.
 * Grok 호출 불가 시 Gemini 2.0 Flash로 자동 폴백합니다.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GROK_MODEL = 'x-ai/grok-4.6'; // 최신 Grok 모델
const FALLBACK_MODEL = 'google/gemini-2.0-flash-001'; // 안정적인 무료/저렴 폴백 모델

export interface GrokAnalysisRequest {
  en: string;
  ko: string;
  guess: string;
  findings: any[];
}

export async function askGrok(request: GrokAnalysisRequest): Promise<string> {
  // 1. 환경 변수에서 먼저 찾고, 없으면 브라우저 로컬 저장소에서 찾습니다.
  let apiKey = (import.meta.env.VITE_OPENROUTER_API_KEY as string) || '';

  if (!apiKey && typeof window !== 'undefined') {
    apiKey = localStorage.getItem('ebq_openrouter_key') || '';
  }

  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }

  const systemPrompt = `
당신은 한국인을 위한 친절한 영어 과외 선생님 'Grok'입니다.
학습자가 틀린 영어 문장을 분석하고, 원어민의 뉘앙스를 설명해 주세요.
- 한국어로 아주 짧게(2~3문장) 응답하세요.
- 어려운 용어보다 '느낌' 중심으로 설명하세요.
`.trim();

  const userPrompt = `
정답: "${request.en}"
뜻: "${request.ko}"
학습자 응답: "${request.guess}"
구조 분석: ${JSON.stringify(request.findings)}

오답 분석과 뉘앙스 설명을 짧게 해줘.
`.trim();

  const makeRequest = (modelId: string) => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/plan153/english-brain-quest-v2',
      'X-Title': 'English Brain Quest v2',
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 300,
    }),
  });

  try {
    // 1. Grok 시도
    let response = await fetch(OPENROUTER_URL, makeRequest(GROK_MODEL));

    // 2. Grok 실패 시(모델 없음, 권한 없음 등) Gemini로 폴백
    if (!response.ok) {
      console.warn(`${GROK_MODEL} 호출 실패, ${FALLBACK_MODEL}로 폴백 시도...`);
      response = await fetch(OPENROUTER_URL, makeRequest(FALLBACK_MODEL));
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    // 만약 폴백으로 결과가 나왔다면 모델명 표시 (선택 사항)
    const prefix = data.model.includes('grok') ? '' : '[Gemini 선생님] ';
    return content ? (prefix + content) : '분석 결과를 가져오지 못했습니다.';

  } catch (err) {
    console.error('OpenRouter call failed:', err);
    throw err;
  }
}
