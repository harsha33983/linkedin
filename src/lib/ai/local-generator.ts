/**
 * Local Rule-Based Post Generator
 *
 * Generates LinkedIn posts using the user's NLP Voice DNA profile
 * without calling any AI API. Uses templates, word banks, and
 * structural patterns derived from the user's writing analysis.
 *
 * Fallback when AI providers are rate-limited or unavailable.
 */

import type { NLPVoiceProfile } from "@/lib/voice/nlp-analyzer";

interface LocalGenerateParams {
  topic: string;
  goal?: string;
  format?: string;
  tone?: string;
  length?: "short" | "medium" | "long";
  targetAudience?: string;
  nlpProfile: NLPVoiceProfile;
  recentPosts?: Array<{ content: string }>;
}

interface GeneratedVersion {
  id: string;
  content: string;
  hook: string;
  hookStyle: string;
  structure: string;
  imageUrl?: string;
  imageQuery?: string;
}

interface LocalGenerateResult {
  versions: GeneratedVersion[];
  analysis: {
    performance_analysis: any;
    content_opportunities: any[];
    selected_opportunity: any;
    hooks: any[];
    reasoning_summary: any;
    confidence: any;
  };
}

/**
 * Generate 3 post versions locally using NLP profile.
 */
export function generatePostLocally(params: LocalGenerateParams): LocalGenerateResult {
  const { topic, goal, format, length, nlpProfile, recentPosts = [] } = params;

  // 1. Determine best structure from NLP storytelling DNA
  const structure = selectStructure(nlpProfile, format);

  // 2. Determine target word count
  const wordCount = getTargetWordCount(length, nlpProfile);

  // 3. Generate 3 hooks using NLP hook patterns
  const hooks = generateHooks(topic, nlpProfile, recentPosts);

  // 4. Generate 3 versions with different angles
  const versions: GeneratedVersion[] = hooks.map((hookData, i) => {
    const content = buildPostContent({
      topic,
      goal,
      hookData,
      structure,
      wordCount,
      nlpProfile,
      nlp: nlpProfile,
      angle: i,
      recentPosts,
    });

    return {
      id: `local_v${i + 1}_${Date.now()}`,
      content,
      hook: hookData.hook,
      hookStyle: hookData.style,
      structure: structure.name,
      format: structure.name,
      scores: { overall: hookData.score, voiceFit: Math.round(nlpProfile.tone.confidenceScore * 100) },
      imageQuery: `${topic} ${hookData.style} linkedin`,
    };
  });

  return {
    versions,
    analysis: {
      performance_analysis: {
        top_topics: [topic],
        top_hook_patterns: hooks.map((h) => h.style),
        top_structures: [structure.name],
        best_length: length || "medium",
        key_audience_signals: nlpProfile.emotionalFingerprint.primaryEmotions,
      },
      content_opportunities: [{
        topic,
        why_now: "User-specified topic",
        opportunity_score: 85,
      }],
      selected_opportunity: { topic, reason: "User-specified", score: 85 },
      hooks: hooks.map((h) => ({ hook: h.hook, style: h.style, score: h.score })),
      reasoning_summary: {
        why_this_topic: "User-specified topic",
        why_this_hook: `Selected ${hooks[0].style} hook based on NLP analysis`,
        why_this_structure: `Selected ${structure.name} based on storytelling DNA`,
        what_historical_signal_influenced_it: `Matched to ${nlpProfile.tone.voiceArchetype} archetype`,
      },
      confidence: {
        overall: nlpProfile.consistency.confidenceLevel === "high" ? "HIGH" : "MEDIUM",
        performance_data: "LOW",
        trend_signal: "LOW",
        voice_dna: nlpProfile.consistency.confidenceLevel.toUpperCase() as any,
      },
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// STRUCTURE SELECTION
// ═══════════════════════════════════════════════════════════════

interface StructureTemplate {
  name: string;
  sections: string[];
  ctaStyle: "question" | "direct" | "soft" | "none";
}

function selectStructure(nlp: NLPVoiceProfile, format?: string): StructureTemplate {
  // Use detected preferred structures
  const preferred = nlp.storytelling.preferredStructures[0] || "opinion_statement";

  // Map NLP structures to templates
  if (format === "Listicle" || preferred.includes("list")) {
    return {
      name: "listicle",
      sections: ["hook", "list_items", "lesson", "cta"],
      ctaStyle: nlp.storytelling.ctaStyle as any || "question",
    };
  }

  if (format === "Personal story" || preferred.includes("narrative") || preferred.includes("story")) {
    return {
      name: "narrative",
      sections: ["hook", "context", "story", "lesson", "cta"],
      ctaStyle: nlp.storytelling.ctaStyle as any || "question",
    };
  }

  if (format === "Contrarian" || preferred.includes("opinion")) {
    return {
      name: "opinion",
      sections: ["hook", "opinion", "evidence", "implication", "cta"],
      ctaStyle: nlp.storytelling.ctaStyle as any || "question",
    };
  }

  if (format === "Framework") {
    return {
      name: "framework",
      sections: ["hook", "problem", "framework_intro", "steps", "cta"],
      ctaStyle: "direct",
    };
  }

  if (format === "Lesson learned") {
    return {
      name: "lesson",
      sections: ["hook", "context", "mistake", "lesson", "cta"],
      ctaStyle: nlp.storytelling.ctaStyle as any || "question",
    };
  }

  // Default: use the first preferred structure
  return {
    name: preferred.replace(/_/g, " "),
    sections: ["hook", "body", "cta"],
    ctaStyle: nlp.storytelling.ctaStyle as any || "question",
  };
}

// ═══════════════════════════════════════════════════════════════
// WORD COUNT
// ═══════════════════════════════════════════════════════════════

function getTargetWordCount(length?: string, nlp?: NLPVoiceProfile): number {
  if (length === "short") return 60;
  if (length === "long") return 200;
  if (nlp?.storytelling.wordCountRange?.avg) return nlp.storytelling.wordCountRange.avg;
  return 120;
}

// ═══════════════════════════════════════════════════════════════
// HOOK GENERATION
// ═══════════════════════════════════════════════════════════════

interface HookData {
  hook: string;
  style: string;
  score: number;
}

function generateHooks(
  topic: string,
  nlp: NLPVoiceProfile,
  recentPosts: Array<{ content: string }>
): HookData[] {
  const hookTypes = nlp.hookPatterns.primaryHookTypes.length > 0
    ? nlp.hookPatterns.primaryHookTypes
    : ["curiosity_gap", "strong_opinion", "personal_story"];

  const recentFirstLines = recentPosts
    .map((p) => (p.content || "").split("\n")[0])
    .filter(Boolean);

  const hooks: HookData[] = [];

  // Generate one hook per detected hook type (up to 3)
  for (let i = 0; i < Math.min(hookTypes.length, 3); i++) {
    const style = hookTypes[i];
    const hook = createHook(topic, style, nlp, recentFirstLines);
    hooks.push({ hook, style, score: 85 - i * 5 });
  }

  // Fill remaining with diversity
  while (hooks.length < 3) {
    const remainingTypes = ["curiosity_gap", "strong_opinion", "personal_story", "contrarian", "question"];
    const unused = remainingTypes.find((t) => !hooks.some((h) => h.style === t));
    const style = unused || "curiosity_gap";
    const hook = createHook(topic, style, nlp, recentFirstLines);
    hooks.push({ hook, style, score: 75 });
  }

  return hooks;
}

function createHook(
  topic: string,
  style: string,
  nlp: NLPVoiceProfile,
  recentFirstLines: string[]
): string {
  const topicLower = topic.toLowerCase();
  const capitalized = topic.charAt(0).toUpperCase() + topic.slice(1);

  // Word banks based on NLP archetype
  const archetype = nlp.tone.voiceArchetype;
  const isDirect = nlp.tone.directnessScore > 0.5;
  const isConfident = nlp.tone.confidenceScore > 0.6;
  const isCasual = nlp.tone.formalityScore < 0.4;

  // Check for repetition with recent posts
  const isRepeated = (text: string) =>
    recentFirstLines.some((rl) => {
      const overlap = text.split(" ").filter((w) => rl.toLowerCase().includes(w.toLowerCase()));
      return overlap.length > text.split(" ").length * 0.5;
    });

  let hook = "";
  let attempts = 0;

  do {
    switch (style) {
      case "personal_story":
        hook = generatePersonalStoryHook(topic, isCasual, isDirect);
        break;
      case "contrarian":
        hook = generateContrarianHook(topic, isConfident, isDirect);
        break;
      case "question":
        hook = generateQuestionHook(topic, isCasual);
        break;
      case "strong_opinion":
        hook = generateOpinionHook(topic, isConfident, isDirect);
        break;
      case "number_list":
        hook = generateNumberListHook(topic);
        break;
      case "curiosity_gap":
      default:
        hook = generateCuriosityHook(topic, isCasual, isDirect);
        break;
    }
    attempts++;
  } while (isRepeated(hook) && attempts < 5);

  return hook;
}

function generatePersonalStoryHook(topic: string, isCasual: boolean, isDirect: boolean): string {
  const templates = isCasual
    ? [
        `I spent months figuring out ${topic}. Here is what actually worked.`,
        `Nobody told me about ${topic}. I had to learn the hard way.`,
        `My biggest lesson with ${topic} came from a failure nobody saw.`,
        `I used to struggle with ${topic}. Then everything changed.`,
        `When I first started with ${topic}, I made every mistake possible.`,
      ]
    : [
        `After years of working with ${topic}, here is what I learned.`,
        `I invested significant time in ${topic}. These are my key takeaways.`,
        `My journey with ${topic} taught me something unexpected.`,
        `Three years into ${topic}, I finally understand what matters.`,
      ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateContrarianHook(topic: string, isConfident: boolean, isDirect: boolean): string {
  const templates = isDirect
    ? [
        `Stop believing everything you hear about ${topic}.`,
        `Most advice about ${topic} is wrong. Here is why.`,
        `The ${topic} industry does not want you to know this.`,
        `Unpopular opinion: ${topic} is overrated.`,
        `Everyone is wrong about ${topic}. Let me explain.`,
      ]
    : [
        `Here is an unpopular take on ${topic}.`,
        `What if everything you know about ${topic} is backwards?`,
        `I disagree with most people about ${topic}.`,
        `The truth about ${topic} that nobody talks about.`,
      ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateQuestionHook(topic: string, isCasual: boolean): string {
  const templates = isCasual
    ? [
        `Why does nobody talk about ${topic}?`,
        `What if ${topic} was simpler than you think?`,
        `Ready to rethink ${topic}?`,
        `Have you considered this about ${topic}?`,
        `What is the one thing about ${topic} that matters most?`,
      ]
    : [
        `Is ${topic} living up to the hype?`,
        `What would happen if you mastered ${topic}?`,
        `How well do you really understand ${topic}?`,
        `Are you making these ${topic} mistakes?`,
      ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateOpinionHook(topic: string, isConfident: boolean, isDirect: boolean): string {
  const templates = isConfident
    ? [
        `${topic} will change everything. Here is why.`,
        `The future of ${topic} is not what you expect.`,
        `Here is the truth about ${topic} that experienced people know.`,
        `${topic} is the most important skill right now.`,
        `If you are not learning ${topic}, you are falling behind.`,
      ]
    : [
        `I believe ${topic} matters more than people realize.`,
        `My perspective on ${topic} after years of experience.`,
        `Here is what I think about ${topic}.`,
        `${topic} deserves more attention than it gets.`,
      ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateNumberListHook(topic: string): string {
  const numbers = [3, 5, 7];
  const n = numbers[Math.floor(Math.random() * numbers.length)];
  const templates = [
    `${n} things I wish I knew about ${topic} earlier.`,
    `${n} lessons from my ${topic} journey.`,
    `${n} mistakes everyone makes with ${topic}.`,
    `${n} reasons ${topic} matters more than you think.`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateCuriosityHook(topic: string, isCasual: boolean, isDirect: boolean): string {
  const templates = isCasual
    ? [
        `Here is what most people miss about ${topic}.`,
        `The ${topic} secret nobody shares publicly.`,
        `I discovered something surprising about ${topic}.`,
        `${topic} is not what it seems. Let me explain.`,
        `There is a hidden side to ${topic} that changes everything.`,
      ]
    : [
        `Here is an insight about ${topic} that took me years to learn.`,
        `The overlooked aspect of ${topic} that drives real results.`,
        `What separates good ${topic} from great ${topic}?`,
        `There is more to ${topic} than meets the eye.`,
      ];
  return templates[Math.floor(Math.random() * templates.length)];
}

// ═══════════════════════════════════════════════════════════════
// POST CONTENT BUILDER
// ═══════════════════════════════════════════════════════════════

interface BuildParams {
  topic: string;
  goal?: string;
  hookData: HookData;
  structure: StructureTemplate;
  wordCount: number;
  nlpProfile: NLPVoiceProfile;
  nlp: NLPVoiceProfile;
  angle: number;
  recentPosts: Array<{ content: string }>;
}

function buildPostContent(params: BuildParams): string {
  const { topic, hookData, structure, wordCount, nlp, angle } = params;

  const parts: string[] = [];

  // 1. Hook
  parts.push(hookData.hook);
  parts.push(""); // blank line after hook

  // 2. Body sections based on structure
  const bodySections = structure.sections.filter((s) => s !== "hook" && s !== "cta");

  for (const section of bodySections) {
    const text = generateSection(section, topic, nlp, angle);
    if (text) {
      parts.push(text);
      parts.push(""); // blank line between sections
    }
  }

  // 3. CTA
  if (structure.ctaStyle !== "none") {
    const cta = generateCTA(structure.ctaStyle, topic, nlp);
    if (cta) parts.push(cta);
  }

  // Join and trim to target word count
  let content = parts.join("\n").trim();

  // Adjust length
  content = adjustLength(content, wordCount, nlp);

  return content;
}

function generateSection(section: string, topic: string, nlp: NLPVoiceProfile, angle: number): string {
  const isDirect = nlp.tone.directnessScore > 0.5;
  const isConfident = nlp.tone.confidenceScore > 0.6;
  const usesFragments = nlp.sentenceStructure.fragmentUsage > 20;

  switch (section) {
    case "context":
      return generateContext(topic, isDirect, angle);
    case "story":
      return generateStory(topic, isDirect, angle);
    case "opinion":
      return generateOpinionBody(topic, isConfident, isDirect, angle);
    case "evidence":
      return generateEvidence(topic, isDirect, angle);
    case "implication":
      return generateImplication(topic, isDirect);
    case "body":
      return generateGenericBody(topic, isDirect, isConfident, angle);
    case "lesson":
      return generateLesson(topic, isDirect, angle);
    case "mistake":
      return generateMistake(topic, isDirect, angle);
    case "problem":
      return generateProblem(topic, isDirect);
    case "framework_intro":
      return `Here is the framework I use for ${topic}:`;
    case "steps":
      return generateSteps(topic, angle);
    case "list_items":
      return generateListItems(topic, angle);
    default:
      return generateGenericBody(topic, isDirect, isConfident, angle);
  }
}

function generateContext(topic: string, isDirect: boolean, angle: number): string {
  const templates = [
    `When I first encountered ${topic}, I had no roadmap.`,
    `${topic} is one of those areas where experience teaches more than theory.`,
    `The challenge with ${topic} is that most resources miss the practical side.`,
    `I have been deep in ${topic} for a while now, and patterns keep emerging.`,
  ];
  return templates[angle % templates.length];
}

function generateStory(topic: string, isDirect: boolean, angle: number): string {
  const templates = [
    `Last quarter, I decided to go all in on ${topic}.\nI tested different approaches, failed multiple times, and eventually found what works.\n\nThe result? Measurable improvement in weeks, not months.`,
    `A colleague once told me: "${topic} is 80% mindset, 20% technique."\nI did not believe it until I tried it myself.\n\nHere is what happened when I shifted my approach.`,
    `I made a critical mistake with ${topic} early on.\nI treated it like a checklist instead of a skill.\n\nOnce I changed my approach, everything clicked.`,
  ];
  return templates[angle % templates.length];
}

function generateOpinionBody(topic: string, isConfident: boolean, isDirect: boolean, angle: number): string {
  const templates = isDirect
    ? [
        `Here is my take:\n\n${topic} is not about perfection.\nIt is about consistency and honest self-assessment.\n\nMost people overcomplicate it. The fundamentals are simple. Execution is what separates results from good intentions.`,
        `The biggest myth about ${topic}?\nThat you need to be an expert to start.\n\nYou do not. You need to be willing to learn in public, make mistakes, and iterate faster than your competition.`,
        `People spend months researching ${topic} before taking action.\nThat is backwards.\n\nStart small. Learn from real feedback. Adjust. Repeat. That is the entire playbook.`,
      ]
    : [
        `From my experience, ${topic} comes down to a few principles.\n\nFirst, start before you feel ready.\nSecond, measure what matters.\nThird, iterate based on real feedback, not assumptions.`,
        `I have observed a pattern with ${topic}:\nthose who succeed focus on fundamentals first.\n\nAdvanced techniques matter, but only after the basics are solid.`,
      ];
  return templates[angle % templates.length];
}

function generateEvidence(topic: string, isDirect: boolean, angle: number): string {
  const templates = [
    `Here is what the data shows:\n\n- Consistency beats intensity every time\n- Small improvements compound over weeks\n- Real feedback beats theoretical knowledge`,
    `The evidence is clear:\n\nPeople who invest in ${topic} see results within weeks.\nThose who wait for perfect conditions rarely start.`,
    `In my experience:\n\nThe difference between average and great ${topic} is not talent.\nIt is deliberate practice and willingness to be uncomfortable.`,
  ];
  return templates[angle % templates.length];
}

function generateImplication(topic: string, isDirect: boolean): string {
  const templates = isDirect
    ? [
        `This means one thing: if you are not actively working on ${topic}, you are falling behind.\nThe gap between those who do and those who do not grows every day.`,
        `The implication is clear:\n${topic} is not optional anymore. It is a competitive advantage that compounds.`,
      ]
    : [
        `What does this mean for you?\n\nStart where you are. Use what you have. Do what you can.\nThe rest will follow.`,
        `This is why I encourage everyone to take ${topic} seriously.\nNot tomorrow. Today.`,
      ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateGenericBody(topic: string, isDirect: boolean, isConfident: boolean, angle: number): string {
  const templates = isDirect
    ? [
        `Here is what I have learned about ${topic}:\n\n1. Start with the basics. Master them before moving on.\n2. Get real feedback early. Assumptions are expensive.\n3. Iterate fast. Perfection is the enemy of progress.\n4. Build in public. Accountability accelerates growth.\n5. Stay consistent. Results compound over time.`,
        `${topic} comes down to three things:\n\n- Clarity: Know exactly what you want to achieve\n- Action: Start before you feel ready\n- Feedback: Let real results guide your next move\n\nMost people skip step one and wonder why step three does not work.`,
        `The most important thing about ${topic} that people overlook:\n\nIt is not about doing more.\nIt is about doing the right things consistently.\n\nFocus beats effort every time.`,
      ]
    : [
        `Here is my perspective on ${topic}:\n\nIt starts with understanding the fundamentals.\nThen it is about consistent application.\nFinally, it is about learning from real-world results.`,
        `I have found that success with ${topic} follows a pattern:\n\n1. Learn the principles\n2. Apply them in real situations\n3. Reflect on what worked and what did not\n4. Refine your approach\n5. Repeat`,
      ];
  return templates[angle % templates.length];
}

function generateLesson(topic: string, isDirect: boolean, angle: number): string {
  const templates = [
    `The lesson? ${topic} rewards those who show up consistently.\nNot those who wait for perfect conditions.\nNot those who chase every new trend.\n\nThose who do the work, day after day.`,
    `What I took away from this:\n\n${topic} is a long game.\nShort-term wins matter less than building sustainable habits.\nPlay the long game.`,
    `My key takeaway:\n\nDo not let perfection delay progress.\nStart messy. Improve iteratively. The results will come.`,
  ];
  return templates[angle % templates.length];
}

function generateMistake(topic: string, isDirect: boolean, angle: number): string {
  const templates = [
    `I wasted months doing ${topic} wrong.\nI was focused on tactics when I should have focused on strategy.\n\nOnce I fixed my approach, results came fast.`,
    `My biggest mistake with ${topic}?\nTrying to do everything at once.\n\nThe fix: pick one thing. Master it. Then move on.`,
    `I learned the hard way that ${topic} without a plan is just busywork.\n\nNow I start every project with clear goals and measurable milestones.`,
  ];
  return templates[angle % templates.length];
}

function generateProblem(topic: string, isDirect: boolean): string {
  const templates = isDirect
    ? [
        `The problem with ${topic} today:\n\nEveryone talks about it. Few people do it well.\nThe gap between knowing and doing is massive.`,
        `${topic} has a fundamental problem:\nMost advice is theoretical.\nWhat actually works in practice is very different from what works in theory.`,
      ]
    : [
        `Here is the challenge I see with ${topic}:\n\nInformation overload makes it hard to know where to start.\nSimplifying the approach changes everything.`,
        `The issue with most ${topic} content:\nIt focuses on what to do, not how to do it consistently.`,
      ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateSteps(topic: string, angle: number): string {
  const steps = [
    `Step 1: Define your specific goal with ${topic}\nStep 2: Audit your current approach\nStep 3: Build a simple, repeatable system\nStep 4: Execute for 30 days without changing direction\nStep 5: Measure results and adjust`,
    `Step 1: Learn the fundamentals (1 week)\nStep 2: Apply them to a real project (2 weeks)\nStep 3: Get feedback from peers or mentors\nStep 4: Refine based on what you learned\nStep 5: Share your results publicly`,
  ];
  return steps[angle % steps.length];
}

function generateListItems(topic: string, angle: number): string {
  const lists = [
    `1. Start with why you want to improve at ${topic}\n2. Find one credible source and go deep\n3. Practice daily, even for 10 minutes\n4. Track your progress visibly\n5. Share what you learn with others`,
    `1. Read one book or course on ${topic} this month\n2. Apply one concept to a real project\n3. Write about what you learned\n4. Ask for feedback from someone experienced\n5. Iterate and repeat monthly`,
  ];
  return lists[angle % lists.length];
}

function generateCTA(style: string, topic: string, nlp: NLPVoiceProfile): string {
  const templates: Record<string, string[]> = {
    question: [
      `What is your experience with ${topic}?`,
      `How are you approaching ${topic}?`,
      `What would you add to this list?`,
      `Have you tried this approach to ${topic}?`,
      `What lesson about ${topic} changed your perspective?`,
    ],
    direct: [
      `Start today. Not tomorrow. Today.`,
      `If this resonated, share it with someone who needs to hear it.`,
      `Save this for when you need a reminder.`,
    ],
    soft: [
      `Hope this helps someone out there.`,
      `Just sharing what I have learned along the way.`,
      `Thanks for reading. Keep building.`,
    ],
    none: [],
  };

  const options = templates[style] || templates.question;
  return options[Math.floor(Math.random() * options.length)];
}

// ═══════════════════════════════════════════════════════════════
// LENGTH ADJUSTMENT
// ═══════════════════════════════════════════════════════════════

function adjustLength(content: string, targetWords: number, nlp: NLPVoiceProfile): string {
  const words = content.split(/\s+/);
  const currentCount = words.length;

  if (Math.abs(currentCount - targetWords) <= 20) {
    return content; // Close enough
  }

  if (currentCount > targetWords + 30) {
    // Too long — trim sentences
    const lines = content.split("\n").filter((l) => l.trim());
    const trimmed: string[] = [];
    let count = 0;

    for (const line of lines) {
      const lineWords = line.split(/\s+/).length;
      if (count + lineWords <= targetWords) {
        trimmed.push(line);
        count += lineWords;
      }
    }

    return trimmed.join("\n");
  }

  // Too short — this is fine for LinkedIn (short posts perform well)
  return content;
}
