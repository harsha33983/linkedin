/**
 * Post Structure Engine — deterministic post architecture selection.
 *
 * The LLM must FILL a structure, not invent one. This module picks the
 * structure (before any LLM call) from the user's requested format, their
 * Voice DNA storytelling profile, and simple keyword signals in the topic.
 */

export type StructureId =
  | "STORY"
  | "LEARNING"
  | "TECHNICAL_EXPLANATION"
  | "PROBLEM_SOLUTION"
  | "FAILURE_LESSON"
  | "OPINION"
  | "CASE_STUDY"
  | "PROJECT_UPDATE"
  | "CAREER_LESSON"
  | "TUTORIAL"
  | "QUESTION"
  | "LIST"
  | "EXPERIENCE";

export interface StructureDef {
  id: StructureId;
  name: string;
  /** Ordered sections the LLM fills. */
  sections: string[];
  /** Best-fit UI format strings (the create page's format enum). */
  formats: string[];
  /** Topic keywords that trigger this structure. */
  signals: string[];
  /** User facts (whatHappened/learned/result) that fit best. */
  factsFit: ("whatHappened" | "whatLearned" | "result")[];
}

export const POST_STRUCTURES: StructureDef[] = [
  {
    id: "STORY", name: "Story",
    sections: ["HOOK", "CONTEXT", "PROBLEM", "ACTION", "RESULT", "LESSON", "QUESTION"],
    formats: ["Personal story"], signals: ["story", "journey", "happened", "when i"],
    factsFit: ["whatHappened", "result"],
  },
  {
    id: "LEARNING", name: "Learning",
    sections: ["HOOK", "SITUATION", "DISCOVERY", "EXPLANATION", "APPLICATION", "QUESTION"],
    formats: ["Lesson learned", "Educational"], signals: ["learned", "lesson", "realized", "insight"],
    factsFit: ["whatLearned"],
  },
  {
    id: "TECHNICAL_EXPLANATION", name: "Technical Explanation",
    sections: ["HOOK", "PROBLEM_SPACE", "APPROACH", "HOW_IT_WORKS", "TRADEOFFS", "TAKEAWAY"],
    formats: ["Educational", "Framework"], signals: ["how", "architecture", "system", "technical", "built"],
    factsFit: [],
  },
  {
    id: "PROBLEM_SOLUTION", name: "Problem → Solution",
    sections: ["HOOK", "PROBLEM", "WHY_HARD", "SOLUTION", "PROOF", "QUESTION"],
    formats: ["Case study", "Educational"], signals: ["problem", "fix", "solve", "issue", "bug"],
    factsFit: ["whatHappened", "result"],
  },
  {
    id: "FAILURE_LESSON", name: "Failure → Lesson",
    sections: ["HOOK", "EXPECTATION", "WHAT_WENT_WRONG", "REALIZATION", "LESSON", "QUESTION"],
    formats: ["Lesson learned", "Personal story"], signals: ["failed", "mistake", "wrong", "regret"],
    factsFit: ["whatHappened", "whatLearned"],
  },
  {
    id: "OPINION", name: "Opinion",
    sections: ["HOOK", "POSITION", "REASONING", "EVIDENCE", "IMPLICATION", "QUESTION"],
    formats: ["Opinion", "Contrarian"], signals: ["think", "believe", "unpopular", "opinion", "wrong about"],
    factsFit: [],
  },
  {
    id: "CASE_STUDY", name: "Case Study",
    sections: ["HOOK", "SUBJECT", "CHALLENGE", "INTERVENTION", "OUTCOME", "REPLICABLE_LESSON"],
    formats: ["Case study"], signals: ["case", "client", "project", "campaign"],
    factsFit: ["result", "whatHappened"],
  },
  {
    id: "PROJECT_UPDATE", name: "Project Update",
    sections: ["HOOK", "WHAT_SHIPPED", "PROCESS", "OBSTACLES", "NUMBERS", "NEXT_STEPS"],
    formats: ["Announcement", "Educational"], signals: ["launched", "shipped", "release", "milestone", "update"],
    factsFit: ["result"],
  },
  {
    id: "CAREER_LESSON", name: "Career Lesson",
    sections: ["HOOK", "MOMENT", "DECISION", "CONSEQUENCE", "LESSON", "QUESTION"],
    formats: ["Lesson learned", "Personal story"], signals: ["job", "career", "interview", "promotion", "manager", "laid off"],
    factsFit: ["whatHappened", "whatLearned"],
  },
  {
    id: "TUTORIAL", name: "Tutorial",
    sections: ["HOOK", "PREREQ", "STEP_1", "STEP_2", "STEP_3", "OUTCOME", "CTA"],
    formats: ["Framework", "Educational"], signals: ["guide", "steps", "tutorial", "how to"],
    factsFit: [],
  },
  {
    id: "QUESTION", name: "Question-led",
    sections: ["HOOK_QUESTION", "MY_ANSWER", "REASONING", "EXAMPLE", "QUESTION_BACK"],
    formats: ["Opinion", "Educational"], signals: ["?"],
    factsFit: [],
  },
  {
    id: "LIST", name: "Listicle",
    sections: ["HOOK", "FRAME", "ITEMS", "BEST_ITEM_EXPANDED", "QUESTION"],
    // Numbered-list cue gets a strong weight via the regex check below.
    formats: ["Listicle"], signals: ["things", "ways", "tips", "lessons", "mistakes", "reasons"],
    factsFit: [],
  },
  {
    id: "EXPERIENCE", name: "Experience Report",
    sections: ["HOOK", "CONTEXT", "WHAT_I_TRIED", "WHAT_WORKED", "WHAT_DIDNT", "RECOMMENDATION"],
    formats: ["Personal story", "Educational"], signals: ["tried", "experiment", "week of", "month of"],
    factsFit: ["whatHappened", "result"],
  },
];

export interface StructureChoiceInput {
  format?: string;
  topic: string;
  hasFacts?: { whatHappened?: boolean; whatLearned?: boolean; result?: boolean };
  /** Preferred structures from the user's Voice DNA storytelling profile, if any. */
  preferredStructures?: string[];
}

/**
 * Deterministically pick the post structure. Priority:
 *  1. Explicit format match (user asked for "Personal story" etc.)
 *  2. User facts present → structures that fit those facts
 *  3. Topic keyword signals
 *  4. Voice DNA preferred structures
 *  5. Default LEARNING (safest generic structure)
 */
export function selectStructure(input: StructureChoiceInput): StructureDef {
  const { format, topic } = input;
  const topicLower = (topic || "").toLowerCase();

  // 1. Explicit format
  if (format) {
    const byFormat = POST_STRUCTURES.find((s) => s.formats.includes(format));
    if (byFormat) return byFormat;
  }

  // 2. Facts fit — facts are the strongest personalization signal
  const facts = input.hasFacts || {};
  if (facts.whatHappened && facts.whatLearned) return byId("FAILURE_LESSON");
  if (facts.whatHappened && facts.result) return byId("STORY");
  if (facts.result) return byId("CASE_STUDY");
  if (facts.whatLearned) return byId("LEARNING");

  // 3. Topic keyword signals — score ALL structures, best match wins.
  // A leading number ("5 mistakes", "3 ways") is a strong listicle cue.
  let best: { def: StructureDef; score: number } | null = null;
  const numberedCue = /^\s*\d+\s+\w+/.test(topicLower) || /\b\d+\s+(things|ways|tips|lessons|mistakes|reasons|steps|rules)/.test(topicLower);
  for (const s of POST_STRUCTURES) {
    let score = 0;
    for (const sig of s.signals) {
      if (topicLower.includes(sig)) score += sig.length >= 6 ? 2 : 1;
    }
    if (numberedCue && s.id === "LIST") score += 3;
    if (score > 0 && (!best || score > best.score)) best = { def: s, score };
  }
  if (best) return best.def;

  // 4. Voice DNA preferred structures
  if (input.preferredStructures?.length) {
    const pref = input.preferredStructures[0] || "";
    if (/narrative|story/.test(pref)) return byId("STORY");
    if (/list/.test(pref)) return byId("LIST");
    if (/opinion/.test(pref)) return byId("OPINION");
    if (/question/.test(pref)) return byId("QUESTION");
  }

  // 5. Safe default
  return byId("LEARNING");
}

export function byId(id: StructureId): StructureDef {
  return POST_STRUCTURES.find((s) => s.id === id) || POST_STRUCTURES[1];
}

/**
 * Render the structure into a prompt block the LLM must follow.
 * The LLM fills sections; it does not invent the architecture.
 */
export function formatStructureForPrompt(def: StructureDef, facts: { whatHappened?: string; whatLearned?: string; result?: string }): string {
  const sectionGuide: Record<string, string> = {
    HOOK: "First line — stop the scroll. Use the user's natural hook style.",
    CONTEXT: "Set the scene in 1–3 short lines.",
    PROBLEM: "The concrete problem or tension.",
    ACTION: "What was actually done (use the user's facts verbatim where given).",
    RESULT: "The outcome. ONLY use numbers the user provided. Never invent metrics.",
    LESSON: "The transferable lesson, in the user's plain words.",
    QUESTION: "Optional closing question matching the user's CTA style.",
    SITUATION: "Where you were before the learning.",
    DISCOVERY: "The moment of realization — specific, not vague.",
    EXPLANATION: "Explain it simply, like to a peer.",
    APPLICATION: "How someone could apply this.",
    PROBLEM_SPACE: "Why this problem exists at all.",
    APPROACH: "The approach taken, concretely.",
    HOW_IT_WORKS: "The mechanics — clear and specific.",
    TRADEOFFS: "Honest tradeoffs or limitations.",
    TAKEAWAY: "One-line takeaway.",
    PROOF: "Evidence (facts provided by user only).",

    EXPECTATION: "What you expected to happen.",
    WHAT_WENT_WRONG: "What actually happened — use the user's facts.",
    REALIZATION: "The honest turning point.",
    POSITION: "State the position plainly in one line.",
    REASONING: "Why you hold it — reasons, not slogans (also used by QUESTION structure: why that answer).",
    EVIDENCE: "Supporting observations.",
    IMPLICATION: "What this means practically.",
    SUBJECT: "Who/what the case is about (anonymized if needed).",
    CHALLENGE: "The starting challenge.",
    INTERVENTION: "What was changed.",
    OUTCOME: "Result — only user-provided numbers.",
    REPLICABLE_LESSON: "What others can copy.",
    WHAT_SHIPPED: "The concrete deliverable.",
    PROCESS: "How it got built (short).",
    OBSTACLES: "One honest obstacle.",
    NUMBERS: "Metrics — only if the user supplied them. Otherwise skip this section.",
    NEXT_STEPS: "What's next.",
    MOMENT: "The specific career moment.",
    DECISION: "The decision made.",
    CONSEQUENCE: "What followed.",
    PREREQ: "What the reader needs first (one line).",
    STEP_1: "Step 1 — concrete action.",
    STEP_2: "Step 2 — concrete action.",
    STEP_3: "Step 3 — concrete action.",
    CTA: "Closing line matching the user's CTA style.",
    HOOK_QUESTION: "Open with a question the reader cares about.",
    MY_ANSWER: "Your answer in one line.",
    EXAMPLE: "A brief concrete example.",
    QUESTION_BACK: "Return the question to the reader.",

    FRAME: "One line of framing for the list.",
    ITEMS: "The list items — short lines, scannable.",
    BEST_ITEM_EXPANDED: "Expand the most interesting item in 1–3 lines.",
    WHAT_I_TRIED: "What was attempted.",
    WHAT_WORKED: "What worked.",
    WHAT_DIDNT: "What didn't (honesty builds trust).",
    RECOMMENDATION: "Who should try this and why.",
  };

  const factLines: string[] = [];
  if (facts.whatHappened) factLines.push(`- WHAT ACTUALLY HAPPENED (use this, do not invent a different story): ${facts.whatHappened}`);
  if (facts.whatLearned) factLines.push(`- WHAT THE USER LEARNED (use this): ${facts.whatLearned}`);
  if (facts.result) factLines.push(`- SPECIFIC RESULT (the only numbers/claims you may reference): ${facts.result}`);

  return [
    `POST STRUCTURE — ${def.name.toUpperCase()} (follow these sections in order; fill each in the user's voice; drop a section only if it adds nothing):`,
    def.sections.map((s) => `  ${s}: ${sectionGuide[s] || ""}`).join("\n"),
    factLines.length ? `\nUSER-PROVIDED FACTS (highest priority content — build the post around these):\n${factLines.join("\n")}` : "",
  ].filter(Boolean).join("\n");
}
