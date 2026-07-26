declare const FuzzyMatch: {
  matchAnswer: (
    input: string,
    expected: string,
    options?: { leniency?: number }
  ) => {
    level: 'exact' | 'fuzzy' | 'wrong';
    score: number;
    feedback: string;
    canonicalTTS: string;
  };
};

export default FuzzyMatch;
