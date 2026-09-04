/**
 * NLP Voice DNA Analyzer
 *
 * Deep analysis of writing patterns using natural language processing:
 * - Sentence structure (length, complexity, fragments)
 * - Vocabulary fingerprint (word choice, sophistication, repetition)
 * - Punctuation personality (exclamation, ellipsis, dashes, periods)
 * - Paragraph rhythm (spacing, line breaks, formatting habits)
 * - Hook architecture (first line patterns, opening techniques)
 * - Tone classifier (formal/casual, confident/humble, direct/indirect)
 * - Storytelling DNA (narrative vs listicle vs opinion vs question)
 * - Emoji & formatting patterns
 * - Emotional fingerprint (what emotions they convey)
 * - Voice consistency score
 */

export interface NLPVoiceProfile {
  // Sentence DNA
  sentenceStructure: {
    avgSentenceLength: number;        // words per sentence
    sentenceLengthVariety: number;    // standard deviation
    shortSentences: number;           // % under 8 words
    mediumSentences: number;          // % 8-20 words
    longSentences: number;            // % over 20 words
    fragmentUsage: number;            // % of lines that are fragments
    questionRatio: number;            // % of sentences that are questions
    exclamationRatio: number;         // % ending with !
    avgClausesPerSentence: number;    // complexity measure
  };

  // Vocabulary DNA
  vocabulary: {
    avgWordLength: number;
    avgSyllablesPerWord: number;
    uniqueWordRatio: number;          // vocabulary diversity
    repetitionPatterns: string[];     // words/phrases used repeatedly
    powerWords: string[];             // strong emotional words
    fillerWords: string[];            // weak words to avoid
    technicalLevel: "simple" | "moderate" | "advanced";
    preferredTransitions: string[];   // how they connect ideas
  };

  // Punctuation Personality
  punctuation: {
    periodStyle: "frequent" | "minimal" | "strategic";   // how often they use periods
    exclamationStyle: "none" | "rare" | "moderate" | "enthusiastic";
    ellipsisUsage: number;            // 0-1 frequency
    dashUsage: number;                // 0-1 frequency (em dashes, en dashes)
    commaStyle: "light" | "standard" | "heavy";
    colonUsage: number;               // 0-1 frequency
    semicolonUsage: number;           // 0-1 frequency
    quoteStyle: "none" | "single" | "double";
  };

  // Paragraph DNA
  paragraphStructure: {
    avgParagraphLength: number;       // sentences per paragraph
    singleSentenceParagraphs: number; // % of paragraphs that are 1 sentence
    lineBreakFrequency: number;       // line breaks per 100 words
    formattingStyle: "dense" | "spaced" | "airy" | "minimal";
    bulletListUsage: number;          // 0-1 frequency
    numberedListUsage: number;        // 0-1 frequency
    boldUsage: number;                // 0-1 frequency (markdown **)
  };

  // Hook Architecture
  hookPatterns: {
    primaryHookTypes: string[];       // most used hook types
    avgHookLength: number;            // words in first line
    hookCharacteristics: string[];    // ["personal", "question", "strong_opinion", etc.]
    openingPatterns: string[];        // actual first-line patterns from posts
    hookToBodyTransition: string;     // how they move from hook to body
  };

  // Tone Classifier
  tone: {
    formalityScore: number;           // 0=casual, 1=formal
    confidenceScore: number;          // 0=humble, 1=confident
    warmthScore: number;             // 0=cold/analytical, 1=warm/personal
    authorityScore: number;           // 0=peer-level, 1=expert
    directnessScore: number;         // 0=indirect/flowery, 1=direct/blunt
    humorScore: number;              // 0=serious, 1=playful
    emotionalRange: string[];         // ["confident", "encouraging", "analytical"]
    voiceArchetype: string;           // e.g. "the mentor", "the rebel", "the storyteller"
  };

  // Storytelling DNA
  storytelling: {
    preferredStructures: string[];    // ["hook_story_lesson", "opinion_evidence_cta", etc.]
    narrativeStyle: "chronological" | "contrast" | "buildup" | "scattered";
    evidenceStyle: "personal_anecdote" | "data_driven" | "both" | "neither";
    ctaStyle: "question" | "direct" | "soft" | "none";
    ctaFrequency: number;            // 0-1 how often they end with CTA
    avgPostLength: "short" | "medium" | "long";
    wordCountRange: { min: number; max: number; avg: number };
  };

  // Emoji & Formatting
  formatting: {
    emojiFrequency: number;           // 0-1
    emojiTypes: string[];             // which emojis they use
    hashtagStyle: "none" | "minimal" | "moderate" | "heavy";
    hashtagPlacement: "end" | "inline" | "both";
    capitalization: "normal" | "strategic_caps" | "ALL_CAPS";
    numberStyle: "digits" | "words" | "mixed";
  };

  // Emotional Fingerprint
  emotionalFingerprint: {
    primaryEmotions: string[];        // what they primarily convey
    emotionalIntensity: "low" | "medium" | "high";
    vulnerabilityLevel: number;       // 0-1 how much they share personal struggles
    inspirationStyle: "story" | "data" | "logic" | "emotion";
    connectionStyle: "peer" | "mentor" | "friend" | "expert";
  };

  // Consistency & Quality
  consistency: {
    voiceConsistencyScore: number;    // 0-1 how consistent is their voice
    sampleSize: number;
    confidenceLevel: "low" | "medium" | "high";
    improvementAreas: string[];       // suggestions for stronger voice
  };
}

/**
 * Analyze writing samples and extract deep NLP voice profile.
 */
export function analyzeWritingWithNLP(samples: string[]): NLPVoiceProfile {
  if (samples.length === 0) {
    return getEmptyNLPProfile();
  }

  // Combine all samples
  const allText = samples.join("\n\n");
  const allLines = allText.split("\n").filter((l) => l.trim());
  const allParagraphs = allText.split(/\n\s*\n/).filter((p) => p.trim());

  // 1. Sentence Structure Analysis
  const sentenceStructure = analyzeSentenceStructure(allText);

  // 2. Vocabulary Analysis
  const vocabulary = analyzeVocabulary(allText);

  // 3. Punctuation Analysis
  const punctuation = analyzePunctuation(allText);

  // 4. Paragraph Structure
  const paragraphStructure = analyzeParagraphStructure(allParagraphs, allText);

  // 5. Hook Architecture
  const hookPatterns = analyzeHookPatterns(samples);

  // 6. Tone Classification
  const tone = classifyTone(allText, samples);

  // 7. Storytelling DNA
  const storytelling = analyzeStorytelling(samples);

  // 8. Emoji & Formatting
  const formatting = analyzeFormatting(allText, allLines);

  // 9. Emotional Fingerprint
  const emotionalFingerprint = analyzeEmotions(allText, samples);

  // 10. Consistency Score
  const consistency = calculateConsistency(samples, sentenceStructure, vocabulary);

  return {
    sentenceStructure,
    vocabulary,
    punctuation,
    paragraphStructure,
    hookPatterns,
    tone,
    storytelling,
    formatting,
    emotionalFingerprint,
    consistency,
  };
}

// ═══════════════════════════════════════════════════════════════
// 1. SENTENCE STRUCTURE
// ═══════════════════════════════════════════════════════════════

function analyzeSentenceStructure(text: string): NLPVoiceProfile["sentenceStructure"] {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const wordCounts = sentences.map((s) => s.split(/\s+/).length);
  const avgLength = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length || 0;
  const variance = wordCounts.reduce((sum, c) => sum + Math.pow(c - avgLength, 2), 0) / wordCounts.length;
  const stdDev = Math.sqrt(variance);

  const lines = text.split("\n").filter((l) => l.trim());
  const fragments = lines.filter((l) => {
    const words = l.trim().split(/\s+/).length;
    return words <= 5 && !l.includes(".") && !l.includes("?") && !l.includes("!");
  });

  const questions = lines.filter((l) => l.trim().endsWith("?"));
  const exclamations = lines.filter((l) => l.trim().endsWith("!"));

  // Clause complexity (approximate: count conjunctions and commas)
  const clauseIndicators = text.split(/\s/).filter((w) =>
    /^(and|but|or|yet|so|because|although|while|when|if|that|which|who|where)$/i.test(w)
  ).length;
  const avgClauses = (clauseIndicators / Math.max(sentences.length, 1)) + 1;

  return {
    avgSentenceLength: Math.round(avgLength * 10) / 10,
    sentenceLengthVariety: Math.round(stdDev * 10) / 10,
    shortSentences: Math.round((wordCounts.filter((c) => c < 8).length / wordCounts.length) * 100),
    mediumSentences: Math.round((wordCounts.filter((c) => c >= 8 && c <= 20).length / wordCounts.length) * 100),
    longSentences: Math.round((wordCounts.filter((c) => c > 20).length / wordCounts.length) * 100),
    fragmentUsage: Math.round((fragments.length / Math.max(lines.length, 1)) * 100),
    questionRatio: Math.round((questions.length / Math.max(lines.length, 1)) * 100),
    exclamationRatio: Math.round((exclamations.length / Math.max(lines.length, 1)) * 100),
    avgClausesPerSentence: Math.round(avgClauses * 10) / 10,
  };
}

// ═══════════════════════════════════════════════════════════════
// 2. VOCABULARY
// ═══════════════════════════════════════════════════════════════

function analyzeVocabulary(text: string): NLPVoiceProfile["vocabulary"] {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  const uniqueWordsSet = new Set(words);
  const uniqueWordCount = uniqueWordsSet.size;

  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length || 0;

  // Syllable count (approximate)
  const countSyllables = (word: string) => {
    word = word.toLowerCase().replace(/[^a-z]/g, "");
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
    word = word.replace(/^y/, "");
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  };
  const avgSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0) / words.length || 0;

  // Word frequency for repetition detection
  const freq: Record<string, number> = {};
  for (const w of words) {
    if (w.length > 3) freq[w] = (freq[w] || 0) + 1;
  }
  const repeated = Object.entries(freq)
    .filter(([, c]) => c >= 3)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([w]) => w);

  // Power words (emotional/impactful)
  const powerWords = ["proven", "secret", "unlock", "transform", "critical", "essential",
    "powerful", "breakthrough", "game-changer", "exclusive", "results", "master",
    "accelerate", "skyrocket", "eliminate", "guarantee", "revolutionary", "ultimate"];
  const foundPower = powerWords.filter((pw) => text.toLowerCase().includes(pw));

  // Filler words
  const fillers = ["very", "really", "quite", "just", "basically", "actually",
    "literally", "honestly", "obviously", "clearly", "simply", "definitely"];
  const foundFillers = fillers.filter((f) => {
    const regex = new RegExp(`\\b${f}\\b`, "gi");
    return regex.test(text);
  });

  // Transitions
  const transitions = ["however", "moreover", "furthermore", "additionally",
    "meanwhile", "consequently", "therefore", "instead", "also", "but",
    "and", "so", "yet", "because", "while"];
  const usedTransitions = transitions.filter((t) => {
    const regex = new RegExp(`^${t}`, "im");
    return text.split("\n").some((line) => regex.test(line.trim()));
  });

  // Technical level
  const techWords = words.filter((w) => w.length > 8).length / words.length;
  const technicalLevel = techWords > 0.15 ? "advanced" : techWords > 0.08 ? "moderate" : "simple";

  return {
    avgWordLength: Math.round(avgWordLength * 10) / 10,
    avgSyllablesPerWord: Math.round(avgSyllables * 10) / 10,
    uniqueWordRatio: Math.round((uniqueWordCount / Math.max(words.length, 1)) * 100) / 100,
    repetitionPatterns: repeated,
    powerWords: foundPower,
    fillerWords: foundFillers,
    technicalLevel,
    preferredTransitions: usedTransitions,
  };
}

// ═══════════════════════════════════════════════════════════════
// 3. PUNCTUATION
// ═══════════════════════════════════════════════════════════════

function analyzePunctuation(text: string): NLPVoiceProfile["punctuation"] {
  const totalChars = text.length || 1;
  const lines = text.split("\n").filter((l) => l.trim());

  const periods = (text.match(/\./g) || []).length;
  const exclamations = (text.match(/!/g) || []).length;
  const ellipsis = (text.match(/\.{3}/g) || []).length;
  const emDashes = (text.match(/[—–]/g) || []).length;
  const commas = (text.match(/,/g) || []).length;
  const colons = (text.match(/:/g) || []).length;
  const semicolons = (text.match(/;/g) || []).length;
  const singleQuotes = (text.match(/'/g) || []).length;
  const doubleQuotes = (text.match(/"/g) || []).length;

  const periodRatio = periods / totalChars;
  const periodStyle = periodRatio > 0.02 ? "frequent" : periodRatio > 0.008 ? "minimal" : "strategic";

  const exclamationRatio = exclamations / Math.max(lines.length, 1);
  const exclamationStyle = exclamationRatio > 0.3 ? "enthusiastic" :
    exclamationRatio > 0.1 ? "moderate" :
      exclamationRatio > 0.02 ? "rare" : "none";

  return {
    periodStyle,
    exclamationStyle,
    ellipsisUsage: Math.min(ellipsis / Math.max(lines.length, 1) * 5, 1),
    dashUsage: Math.min(emDashes / Math.max(lines.length, 1) * 3, 1),
    commaStyle: commas / Math.max(lines.length, 1) > 3 ? "heavy" :
      commas / Math.max(lines.length, 1) > 1.5 ? "standard" : "light",
    colonUsage: Math.min(colons / Math.max(lines.length, 1) * 5, 1),
    semicolonUsage: Math.min(semicolons / Math.max(lines.length, 1) * 10, 1),
    quoteStyle: doubleQuotes > singleQuotes ? "double" : singleQuotes > 0 ? "single" : "none",
  };
}

// ═══════════════════════════════════════════════════════════════
// 4. PARAGRAPH STRUCTURE
// ═══════════════════════════════════════════════════════════════

function analyzeParagraphStructure(paragraphs: string[], fullText: string): NLPVoiceProfile["paragraphStructure"] {
  const paraSentences = paragraphs.map((p) =>
    p.split(/[.!?]+/).filter((s) => s.trim().length > 0).length
  );

  const avgParaLength = paraSentences.reduce((a, b) => a + b, 0) / paraSentences.length || 0;
  const singleSentenceParas = paraSentences.filter((c) => c === 1).length;

  const wordCount = fullText.split(/\s+/).length;
  const lineBreaks = (fullText.match(/\n/g) || []).length;
  const lineBreakFreq = (lineBreaks / Math.max(wordCount, 1)) * 100;

  const bulletLines = fullText.split("\n").filter((l) => /^\s*[-•*]\s/.test(l) || /^\s*\d+[.)]\s/.test(l));
  const numberedLines = fullText.split("\n").filter((l) => /^\s*\d+[.)]\s/.test(l));

  let formattingStyle: "dense" | "spaced" | "airy" | "minimal" = "spaced";
  if (lineBreakFreq > 5) formattingStyle = "airy";
  else if (lineBreakFreq > 3) formattingStyle = "spaced";
  else if (lineBreakFreq < 1) formattingStyle = "dense";
  else formattingStyle = "minimal";

  return {
    avgParagraphLength: Math.round(avgParaLength * 10) / 10,
    singleSentenceParagraphs: Math.round((singleSentenceParas / Math.max(paragraphs.length, 1)) * 100),
    lineBreakFrequency: Math.round(lineBreakFreq * 10) / 10,
    formattingStyle,
    bulletListUsage: Math.min(bulletLines.length / Math.max(wordCount / 50, 1), 1),
    numberedListUsage: Math.min(numberedLines.length / Math.max(wordCount / 50, 1), 1),
    boldUsage: (fullText.match(/\*\*[^*]+\*\*/g) || []).length > 0 ? 1 : 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// 5. HOOK ARCHITECTURE
// ═══════════════════════════════════════════════════════════════

function analyzeHookPatterns(samples: string[]): NLPVoiceProfile["hookPatterns"] {
  const hooks = samples
    .map((s) => s.split("\n")[0]?.trim() || "")
    .filter((h) => h.length > 0);

  const hookTypes = hooks.map(classifyHook);
  const hookLengths = hooks.map((h) => h.split(/\s+/).length);

  // Count hook types
  const typeCounts: Record<string, number> = {};
  for (const t of hookTypes) {
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  const primaryTypes = Object.entries(typeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([t]) => t);

  // Hook characteristics
  const characteristics: string[] = [];
  if (hooks.some((h) => h.endsWith("?"))) characteristics.push("question_opener");
  if (hooks.some((h) => /^(I |My |When I )/.test(h))) characteristics.push("personal_first");
  if (hooks.some((h) => /\d+\s/.test(h))) characteristics.push("number_driven");
  if (hooks.some((h) => h.length < 30)) characteristics.push("short_punchy");
  if (hooks.some((h) => h.length > 60)) characteristics.push("detailed_setup");
  if (hooks.some((h) => /[—–]/.test(h))) characteristics.push("em_dash_style");
  if (hooks.some((h) => h.endsWith("!"))) characteristics.push("exclamatory");

  // Hook-to-body transition
  const transitions = samples.map((s) => {
    const lines = s.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return "none";
    const secondLine = lines[1].trim();
    if (secondLine.startsWith("I ") || secondLine.startsWith("My ")) return "personal_bridge";
    if (secondLine.startsWith("Here") || secondLine.startsWith("This")) return "direct_explanation";
    if (secondLine.startsWith("But") || secondLine.startsWith("Yet")) return "contrast_shift";
    return "narrative_flow";
  });
  const transitionCounts: Record<string, number> = {};
  for (const t of transitions) {
    transitionCounts[t] = (transitionCounts[t] || 0) + 1;
  }
  const primaryTransition = Object.entries(transitionCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || "narrative_flow";

  return {
    primaryHookTypes: primaryTypes,
    avgHookLength: Math.round(hookLengths.reduce((a, b) => a + b, 0) / hookLengths.length),
    hookCharacteristics: characteristics,
    openingPatterns: hooks.slice(0, 5),
    hookToBodyTransition: primaryTransition,
  };
}

function classifyHook(hook: string): string {
  const lower = hook.toLowerCase();
  if (/^(I |My |When I |Last week|Yesterday|Today)/.test(hook)) return "personal_story";
  if (hook.endsWith("?")) return "question";
  if (/^(Stop|Don't|Never|No more|Enough)/.test(hook)) return "contrarian";
  if (/^\d+\s/.test(hook) || /\d+:\s/.test(hook)) return "number_list";
  if (/^(Most people|Everyone|Nobody|The truth)/.test(hook)) return "strong_opinion";
  if (/^(Here'?s?|This is|The)/.test(hook)) return "direct_statement";
  if (hook.length < 15) return "teaser";
  return "curiosity_gap";
}

// ═══════════════════════════════════════════════════════════════
// 6. TONE CLASSIFIER
// ═══════════════════════════════════════════════════════════════

function classifyTone(text: string, samples: string[]): NLPVoiceProfile["tone"] {
  const words = text.toLowerCase().split(/\s+/);
  const wordCount = words.length || 1;

  // Formality indicators
  const formalWords = ["furthermore", "consequently", "nevertheless", "subsequently",
    "regarding", "concerning", "henceforth", "wherein", "aforementioned"];
  const casualWords = ["gonna", "wanna", "kinda", "stuff", "things", "cool",
    "awesome", "super", "basically", "literally", "honestly"];
  const formalCount = formalWords.filter((f) => text.toLowerCase().includes(f)).length;
  const casualCount = casualWords.filter((c) => text.toLowerCase().includes(c)).length;
  const formalityScore = Math.min(Math.max((formalCount - casualCount + 3) / 6, 0), 1);

  // Confidence indicators
  const confidentWords = ["must", "will", "always", "never", "proven", "guaranteed",
    "definitely", "certainly", "absolutely", "clearly"];
  const humbleWords = ["maybe", "perhaps", "might", "could", "possibly", "sometimes",
    "in my experience", "I think", "I believe"];
  const confidentCount = confidentWords.filter((c) => words.includes(c)).length;
  const humbleCount = humbleWords.filter((h) => text.toLowerCase().includes(h)).length;
  const confidenceScore = Math.min(Math.max((confidentCount - humbleCount + 3) / 6, 0), 1);

  // Warmth indicators
  const warmWords = ["love", "care", "together", "community", "friend", "help",
    "support", "appreciate", "grateful", "thank"];
  const warmCount = warmWords.filter((w) => text.toLowerCase().includes(w)).length;
  const warmthScore = Math.min(warmCount / 5, 1);

  // Authority indicators
  const authorityWords = ["years of", "experience", "built", "launched", "grew",
    "managed", "led", "founded", "created", "shipped"];
  const authorityCount = authorityWords.filter((a) => text.toLowerCase().includes(a)).length;
  const authorityScore = Math.min(authorityCount / 4, 1);

  // Directness
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim());
  const avgSentenceLen = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length;
  const directnessScore = Math.min(Math.max(1 - (avgSentenceLen / 25), 0), 1);

  // Humor
  const humorWords = ["funny", "hilarious", "laugh", "joke", "irony", "sarcastic",
    "plot twist", "spoiler", "unpopular opinion"];
  const humorCount = humorWords.filter((h) => text.toLowerCase().includes(h)).length;
  const humorScore = Math.min(humorCount / 3, 1);

  // Voice archetype
  let voiceArchetype = "the practitioner";
  if (authorityScore > 0.7 && confidenceScore > 0.7) voiceArchetype = "the expert";
  else if (warmthScore > 0.6 && formalityScore < 0.3) voiceArchetype = "the friend";
  else if (confidenceScore > 0.7 && directnessScore > 0.6) voiceArchetype = "the direct communicator";
  else if (humorScore > 0.3) voiceArchetype = "the storyteller";
  else if (formalityScore > 0.6) voiceArchetype = "the analyst";

  // Emotional range
  const emotionalRange: string[] = [];
  if (confidenceScore > 0.6) emotionalRange.push("confident");
  if (warmthScore > 0.5) emotionalRange.push("encouraging");
  if (formalityScore > 0.6) emotionalRange.push("analytical");
  if (humorScore > 0.3) emotionalRange.push("playful");
  if (authorityScore > 0.6) emotionalRange.push("authoritative");
  if (emotionalRange.length === 0) emotionalRange.push("neutral");

  return {
    formalityScore: Math.round(formalityScore * 100) / 100,
    confidenceScore: Math.round(confidenceScore * 100) / 100,
    warmthScore: Math.round(warmthScore * 100) / 100,
    authorityScore: Math.round(authorityScore * 100) / 100,
    directnessScore: Math.round(directnessScore * 100) / 100,
    humorScore: Math.round(humorScore * 100) / 100,
    emotionalRange,
    voiceArchetype,
  };
}

// ═══════════════════════════════════════════════════════════════
// 7. STORYTELLING DNA
// ═══════════════════════════════════════════════════════════════

function analyzeStorytelling(samples: string[]): NLPVoiceProfile["storytelling"] {
  const structures: string[] = [];

  for (const sample of samples) {
    const lines = sample.split("\n").filter((l) => l.trim());
    const firstLine = lines[0] || "";
    const lastLine = lines[lines.length - 1] || "";

    // Detect structure
    const hasQuestion = lines.some((l) => l.endsWith("?"));
    const hasNumber = lines.some((l) => /^\d+[.)]\s/.test(l.trim()));
    const hasStory = lines.some((l) => /^(I |My |When |Last |Yesterday|Today)/.test(l.trim()));
    const hasCTA = /comment|share|what do you|thoughts\?|agree\?/i.test(lastLine);

    if (hasStory && hasQuestion) structures.push("hook_story_question");
    else if (hasStory && hasCTA) structures.push("hook_story_cta");
    else if (hasNumber && hasCTA) structures.push("list_cta");
    else if (hasNumber) structures.push("listicle");
    else if (hasQuestion) structures.push("question_answer");
    else if (hasStory) structures.push("narrative");
    else structures.push("opinion_statement");
  }

  const structureCounts: Record<string, number> = {};
  for (const s of structures) {
    structureCounts[s] = (structureCounts[s] || 0) + 1;
  }
  const preferredStructures = Object.entries(structureCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([s]) => s);

  // Word count analysis
  const wordCounts = samples.map((s) => s.split(/\s+/).length);
  const avgWordCount = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;

  // CTA detection
  const ctaSamples = samples.filter((s) =>
    /comment|share|what do you|thoughts\?|agree\?|link in|dm me/i.test(s)
  );

  // Evidence style
  const personalAnecdotes = samples.filter((s) =>
    /^(I |My |When I |Last week|Yesterday)/.test(s.split("\n")[0] || "")
  ).length;

  const evidenceStyle = personalAnecdotes > samples.length * 0.5 ? "personal_anecdote" :
    personalAnecdotes > samples.length * 0.2 ? "both" : "data_driven";

  return {
    preferredStructures,
    narrativeStyle: "chronological", // simplified
    evidenceStyle,
    ctaStyle: ctaSamples.length > samples.length * 0.3 ? "question" :
      ctaSamples.length > 0 ? "soft" : "none",
    ctaFrequency: Math.round((ctaSamples.length / Math.max(samples.length, 1)) * 100) / 100,
    avgPostLength: avgWordCount < 80 ? "short" : avgWordCount < 200 ? "medium" : "long",
    wordCountRange: {
      min: Math.min(...wordCounts),
      max: Math.max(...wordCounts),
      avg: Math.round(avgWordCount),
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// 8. FORMATTING
// ═══════════════════════════════════════════════════════════════

function analyzeFormatting(text: string, lines: string[]): NLPVoiceProfile["formatting"] {
  // Emojis
  const emojis = text.match(/[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF]/g) || [];
  const emojiFrequency = Math.min(emojis.length / Math.max(lines.length, 1), 1);

  // Hashtags
  const hashtags = text.match(/#[\w]+/g) || [];
  const hashtagCount = hashtags.length;
  const hashtagStyle = hashtagCount === 0 ? "none" :
    hashtagCount <= 3 ? "minimal" :
      hashtagCount <= 7 ? "moderate" : "heavy";

  // Hashtag placement
  const lastLine = lines[lines.length - 1] || "";
  const hashtagPlacement = lastLine.match(/#[\w]+/) ? "end" : "inline";

  // Caps usage
  const capsWords = lines.filter((l) => /^[A-Z]{2,}/.test(l.trim())).length;
  const capitalization = capsWords > lines.length * 0.1 ? "strategic_caps" :
    capsWords > 0 ? "ALL_CAPS" : "normal";

  // Number style
  const digitNumbers = (text.match(/\b\d+\b/g) || []).length;
  const wordNumbers = (text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi) || []).length;
  const numberStyle = digitNumbers > wordNumbers * 2 ? "digits" :
    wordNumbers > digitNumbers * 2 ? "words" : "mixed";

  return {
    emojiFrequency: Math.round(emojiFrequency * 100) / 100,
    emojiTypes: Array.from(new Set(emojis)).slice(0, 5),
    hashtagStyle,
    hashtagPlacement,
    capitalization,
    numberStyle,
  };
}

// ═══════════════════════════════════════════════════════════════
// 9. EMOTIONAL FINGERPRINT
// ═══════════════════════════════════════════════════════════════

function analyzeEmotions(text: string, samples: string[]): NLPVoiceProfile["emotionalFingerprint"] {
  const lower = text.toLowerCase();

  // Primary emotions
  const emotionMap: Record<string, string[]> = {
    confidence: ["proven", "must", "always", "never", "definitely", "clearly"],
    passion: ["love", "excited", "amazing", "incredible", "passion", "drive"],
    frustration: ["frustrated", "annoyed", "tired", "sick of", "enough", "stop"],
    inspiration: ["dream", "believe", "possible", "future", "vision", "goal"],
    humility: ["learned", "mistake", "failed", "struggled", "hard", "challenge"],
    urgency: ["now", "today", "immediately", "before", "deadline", "critical"],
  };

  const primaryEmotions: string[] = [];
  for (const [emotion, keywords] of Object.entries(emotionMap)) {
    const count = keywords.filter((k) => lower.includes(k)).length;
    if (count >= 2) primaryEmotions.push(emotion);
  }
  if (primaryEmotions.length === 0) primaryEmotions.push("neutral");

  // Emotional intensity
  const exclamationCount = (text.match(/!/g) || []).length;
  const capsCount = (text.match(/[A-Z]{2,}/g) || []).length;
  const intensity = (exclamationCount + capsCount) / Math.max(samples.length, 1);
  const emotionalIntensity = intensity > 2 ? "high" : intensity > 0.5 ? "medium" : "low";

  // Vulnerability
  const vulnerabilityWords = ["failed", "struggle", "mistake", "embarrassing",
    "vulnerable", "honest", "truth", "admit", "confess", "imperfect"];
  const vulnCount = vulnerabilityWords.filter((v) => lower.includes(v)).length;
  const vulnerabilityLevel = Math.min(vulnCount / 4, 1);

  // Connection style
  const peerWords = ["we", "us", "together", "fellow", "community"];
  const mentorWords = ["learn", "tip", "advice", "lesson", "here's how"];
  const peerCount = peerWords.filter((p) => lower.includes(p)).length;
  const mentorCount = mentorWords.filter((m) => lower.includes(m)).length;
  const connectionStyle = peerCount > mentorCount ? "peer" :
    mentorCount > 0 ? "mentor" : "expert";

  return {
    primaryEmotions,
    emotionalIntensity,
    vulnerabilityLevel: Math.round(vulnerabilityLevel * 100) / 100,
    inspirationStyle: "story", // simplified
    connectionStyle,
  };
}

// ═══════════════════════════════════════════════════════════════
// 10. CONSISTENCY
// ═══════════════════════════════════════════════════════════════

function calculateConsistency(
  samples: string[],
  sentenceStructure: NLPVoiceProfile["sentenceStructure"],
  vocabulary: NLPVoiceProfile["vocabulary"]
): NLPVoiceProfile["consistency"] {
  const sampleSize = samples.length;

  // Check if sentence lengths are consistent across samples
  const sampleLengths = samples.map((s) => {
    const sentences = s.split(/[.!?]+/).filter((sent) => sent.trim());
    return sentences.reduce((sum, sent) => sum + sent.split(/\s+/).length, 0) / sentences.length;
  });

  const avgSampleLength = sampleLengths.reduce((a, b) => a + b, 0) / sampleLengths.length;
  const lengthVariance = sampleLengths.reduce((sum, l) => sum + Math.pow(l - avgSampleLength, 2), 0) / sampleLengths.length;
  const consistencyScore = Math.max(0, 1 - Math.sqrt(lengthVariance) / 10);

  const confidenceLevel = sampleSize < 3 ? "low" : sampleSize < 10 ? "medium" : "high";

  const improvementAreas: string[] = [];
  if (sampleSize < 5) improvementAreas.push("Add more writing samples for better voice detection");
  if (vocabulary.uniqueWordRatio < 0.5) improvementAreas.push("Vocabulary seems repetitive — consider varying word choice");
  if (sentenceStructure.fragmentUsage > 50) improvementAreas.push("Heavy use of fragments — ensure readability");

  return {
    voiceConsistencyScore: Math.round(consistencyScore * 100) / 100,
    sampleSize,
    confidenceLevel,
    improvementAreas,
  };
}

// ═══════════════════════════════════════════════════════════════
// EMPTY PROFILE
// ═══════════════════════════════════════════════════════════════

function getEmptyNLPProfile(): NLPVoiceProfile {
  return {
    sentenceStructure: { avgSentenceLength: 0, sentenceLengthVariety: 0, shortSentences: 0, mediumSentences: 0, longSentences: 0, fragmentUsage: 0, questionRatio: 0, exclamationRatio: 0, avgClausesPerSentence: 0 },
    vocabulary: { avgWordLength: 0, avgSyllablesPerWord: 0, uniqueWordRatio: 0, repetitionPatterns: [], powerWords: [], fillerWords: [], technicalLevel: "simple", preferredTransitions: [] },
    punctuation: { periodStyle: "minimal", exclamationStyle: "none", ellipsisUsage: 0, dashUsage: 0, commaStyle: "standard", colonUsage: 0, semicolonUsage: 0, quoteStyle: "none" },
    paragraphStructure: { avgParagraphLength: 0, singleSentenceParagraphs: 0, lineBreakFrequency: 0, formattingStyle: "spaced", bulletListUsage: 0, numberedListUsage: 0, boldUsage: 0 },
    hookPatterns: { primaryHookTypes: [], avgHookLength: 0, hookCharacteristics: [], openingPatterns: [], hookToBodyTransition: "narrative_flow" },
    tone: { formalityScore: 0.5, confidenceScore: 0.5, warmthScore: 0.5, authorityScore: 0.5, directnessScore: 0.5, humorScore: 0, emotionalRange: ["neutral"], voiceArchetype: "the practitioner" },
    storytelling: { preferredStructures: [], narrativeStyle: "chronological", evidenceStyle: "both", ctaStyle: "none", ctaFrequency: 0, avgPostLength: "medium", wordCountRange: { min: 0, max: 0, avg: 0 } },
    formatting: { emojiFrequency: 0, emojiTypes: [], hashtagStyle: "none", hashtagPlacement: "end", capitalization: "normal", numberStyle: "digits" },
    emotionalFingerprint: { primaryEmotions: ["neutral"], emotionalIntensity: "low", vulnerabilityLevel: 0, inspirationStyle: "story", connectionStyle: "peer" },
    consistency: { voiceConsistencyScore: 0, sampleSize: 0, confidenceLevel: "low", improvementAreas: [] },
  };
}

/**
 * Format NLP profile into a human-readable prompt section.
 */
export function formatNLPProfileForPrompt(profile: NLPVoiceProfile): string {
  return `
DEEP NLP VOICE ANALYSIS (from ${profile.consistency.sampleSize} writing samples):

SENTENCE DNA:
- Average sentence length: ${profile.sentenceStructure.avgSentenceLength} words
- Short sentences (<8 words): ${profile.sentenceStructure.shortSentences}%
- Long sentences (>20 words): ${profile.sentenceStructure.longSentences}%
- Fragment usage: ${profile.sentenceStructure.fragmentUsage}%
- Question ratio: ${profile.sentenceStructure.questionRatio}%
- Sentence length variety: ${profile.sentenceStructure.sentenceLengthVariety} (higher = more rhythm)

VOCABULARY DNA:
- Average word length: ${profile.vocabulary.avgWordLength} characters
- Vocabulary diversity: ${Math.round(profile.vocabulary.uniqueWordRatio * 100)}%
- Technical level: ${profile.vocabulary.technicalLevel}
- Power words used: ${profile.vocabulary.powerWords.join(", ") || "none"}
- Filler words found: ${profile.vocabulary.fillerWords.join(", ") || "none"}
- Preferred transitions: ${profile.vocabulary.preferredTransitions.join(", ") || "none"}

PUNCTUATION DNA:
- Period style: ${profile.punctuation.periodStyle}
- Exclamation style: ${profile.punctuation.exclamationStyle}
- Dash usage: ${profile.punctuation.dashUsage > 0.3 ? "frequent" : "minimal"}
- Comma style: ${profile.punctuation.commaStyle}

PARAGRAPH DNA:
- Single-sentence paragraphs: ${profile.paragraphStructure.singleSentenceParagraphs}%
- Line break frequency: ${profile.paragraphStructure.lineBreakFrequency} per 100 words
- Formatting style: ${profile.paragraphStructure.formattingStyle}
- Bullet/number lists: ${profile.paragraphStructure.bulletListUsage > 0.3 ? "frequent" : "rare"}

HOOK DNA:
- Primary hook types: ${profile.hookPatterns.primaryHookTypes.join(", ")}
- Average hook length: ${profile.hookPatterns.avgHookLength} words
- Hook characteristics: ${profile.hookPatterns.hookCharacteristics.join(", ")}
- Hook-to-body transition: ${profile.hookPatterns.hookToBodyTransition}

TONE DNA:
- Formality: ${Math.round(profile.tone.formalityScore * 100)}% (${profile.tone.formalityScore > 0.6 ? "formal" : profile.tone.formalityScore < 0.4 ? "casual" : "balanced"})
- Confidence: ${Math.round(profile.tone.confidenceScore * 100)}% (${profile.tone.confidenceScore > 0.6 ? "confident" : profile.tone.confidenceScore < 0.4 ? "humble" : "balanced"})
- Warmth: ${Math.round(profile.tone.warmthScore * 100)}%
- Directness: ${Math.round(profile.tone.directnessScore * 100)}%
- Voice archetype: ${profile.tone.voiceArchetype}
- Emotional range: ${profile.tone.emotionalRange.join(", ")}

STORYTELLING DNA:
- Preferred structures: ${profile.storytelling.preferredStructures.join(", ")}
- Evidence style: ${profile.storytelling.evidenceStyle}
- CTA style: ${profile.storytelling.ctaStyle}
- CTA frequency: ${Math.round(profile.storytelling.ctaFrequency * 100)}%
- Post length: ${profile.storytelling.avgPostLength} (${profile.storytelling.wordCountRange.avg} words avg)

EMOTIONAL FINGERPRINT:
- Primary emotions: ${profile.emotionalFingerprint.primaryEmotions.join(", ")}
- Emotional intensity: ${profile.emotionalFingerprint.emotionalIntensity}
- Vulnerability level: ${Math.round(profile.emotionalFingerprint.vulnerabilityLevel * 100)}%
- Connection style: ${profile.emotionalFingerprint.connectionStyle}

FORMATTING DNA:
- Emoji usage: ${profile.formatting.emojiFrequency > 0.3 ? "frequent" : profile.formatting.emojiFrequency > 0.1 ? "moderate" : "minimal"}
- Hashtag style: ${profile.formatting.hashtagStyle}
- Number style: ${profile.formatting.numberStyle}

CRITICAL RULES:
- Match this person's sentence rhythm EXACTLY
- Use their vocabulary level (not higher, not lower)
- Mirror their punctuation habits
- Preserve their paragraph spacing
- Match their hook style
- Embody their voice archetype: ${profile.tone.voiceArchetype}
`;
}
