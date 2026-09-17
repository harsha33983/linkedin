/**
 * Generation context assembly — bridge between buildPostGenerationContext()
 * (existing DNA/metrics context) and the new structure/humanizer/RAG/quality
 * modules. Kept separate so the routes stay readable.
 */

import { selectStructure, formatStructureForPrompt } from "./post-structure";
import { buildHumanizerBlock, UserFacts } from "./humanizer";
import { retrieveStyleExamples, formatExamplesForPrompt, storeWritingExample } from "./style-examples";
import { getLearnedStyleAdjustments } from "./edit-learning";
import { analyzeContentQuality, ContentQuality } from "./content-quality";

export { formatStructureForPrompt };

/** Assemble the humanizer prompt block + chosen structure for a generation. */
export async function buildStyleContext(
  userId: string,
  parsed: { topic: string; format?: string; tone?: string; length?: "short" | "medium" | "long"; targetAudience?: string; whatHappened?: string; whatLearned?: string; result?: string },
  voiceProfile: any
): Promise<{ humanizerBlock: string; structureId: string; facts: UserFacts }> {
  const facts: UserFacts = {
    whatHappened: parsed.whatHappened?.trim() || undefined,
    whatLearned: parsed.whatLearned?.trim() || undefined,
    result: parsed.result?.trim() || undefined,
  };

  const structure = selectStructure({
    format: parsed.format,
    topic: parsed.topic,
    hasFacts: {
      whatHappened: Boolean(facts.whatHappened),
      whatLearned: Boolean(facts.whatLearned),
      result: Boolean(facts.result),
    },
    preferredStructures: voiceProfile?.nlpProfile?.storytelling?.preferredStructures || voiceProfile?.storytelling?.preferredStructures,
  });

  // RAG: user's own writing examples + learned adjustments (both cheap, both cached in DB)
  const [examples, learned] = await Promise.all([
    retrieveStyleExamples(userId, parsed.topic, 5),
    getLearnedStyleAdjustments(userId),
  ]);

  const humanizerBlock = buildHumanizerBlock({
    structure,
    facts,
    nlpProfile: voiceProfile?.nlpProfile || null,
    learnedAdjustments: learned,
    examplesBlock: formatExamplesForPrompt(examples),
    targetAudience: parsed.targetAudience,
    tone: parsed.tone,
    length: parsed.length,
  });

  return { humanizerBlock, structureId: structure.id, facts };
}

/** Quality-gate one generated version. Deterministic, zero LLM cost. */
export function qualityGate(
  content: string,
  facts: UserFacts,
  recentHooks: string[]
): ContentQuality {
  return analyzeContentQuality(content, { userFacts: facts, recentHooks });
}

/** Persist a final (user-edited) version as a style example for future RAG. */
export async function persistFinalAsExample(userId: string, content: string): Promise<void> {
  await storeWritingExample(userId, content, "FINAL_EDIT");
}
