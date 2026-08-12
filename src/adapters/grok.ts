/**
 * grok.ts — OpenRouter를 통한 xAI (Grok) API 어댑터.
 * 한국 IP 차단을 우회하여 Grok 모델을 호출합니다.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GROK_MODEL = 'x-ai/grok-beta'; // OpenRouter에서의 Grok 모델 ID

export interface GrokAnalysisRequest {
  en: string;   // 정답 문장
  ko: string;   // 목표 뜻 (한국어)
  guess: string; // 사용자가 말한/입력한 문장
  findings: any[]; // 로컬에서 분석된 구조적 오류 정보
}

export async function askGrok(request: GrokAnalysisRequest): Promise<string> {
  // OpenRouter API 키를 사용합니다.
  const apiKey = (import.meta.env.VITE_OPENROUTER_API_KEY as string) || '';

  if (!apiKey) {
    // 키가 없으면 에러를 던져 UI에서 안내하게 함
    throw new Error('API_KEY_MISSING');
  }

  const systemPrompt = `
당신은 한국인을 위한 친절한 영어 과외 선생님 'Grok'입니다.
학습자가 틀린 영어 문장을 분석하고, 로컬 분석 데이터(findings)를 바탕으로 '왜' 틀렸는지, 
원어민은 어떤 느낌으로 받아들이는지 짧고 명확하게 설명해 주세요.

지침:
1. 모든 설명은 한국어로 하세요.
2. 분석은 2~3문장 이내로 아주 짧게 하세요. (학습 흐름을 방해하지 않도록)
3. 어려운 문법 용어보다는 '느낌'과 '실제 쓰임새' 중심으로 설명하세요.
`.trim();

  const userPrompt = `
정답: "${request.en}"
뜻: "${request.ko}"
학습자 응답: "${request.guess}"
구조 분석 데이터: ${JSON.stringify(request.findings)}

위의 오답을 분석해서 짧은 조언 한 줄과 뉘앙스 설명을 해줘.
`.trim();

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/plan153/english-brain-quest-v2', // OpenRouter 권장 헤더
        'X-Title': 'English Brain Quest v2',
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '분석 결과를 가져오지 못했습니다.';
  } catch (err) {
    console.error('OpenRouter/Grok call failed:', err);
    throw err;
  }
}
