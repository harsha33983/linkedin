/**
 * Queue Dispatchers — Mock Mode
 *
 * Development implementations without Redis/BullMQ:
 * voice reanalysis runs in-process in the background so the feature
 * actually works locally (a real BullMQ worker would do the same work).
 */

import { analyzeVoiceProfile } from "@/lib/voice/analyze";

export interface VoiceReanalysisJobData {
  userId: string;
  triggerReason: string;
}

export interface PostGenerationJobData {
  userId: string;
  input: Record<string, unknown>;
}

export interface QualityCheckJobData {
  generationId: string;
  content: string;
  userId: string;
}

export async function dispatchVoiceReanalysis(data: VoiceReanalysisJobData): Promise<void> {
  console.log("[Queue:mock] Voice reanalysis dispatched:", data.triggerReason);
  // Run the same pipeline a BullMQ worker would run, fire-and-forget so
  // the API response stays fast. Failures are logged, never thrown.
  try {
    const result = await analyzeVoiceProfile(data.userId, data.triggerReason);
    console.log(
      "[Queue:mock] Voice reanalysis complete:",
      data.triggerReason,
      "| sampleCount:",
      result.sampleCount,
      "| usedNlpOnly:",
      result.usedNlpOnly
    );
  } catch (err: any) {
    console.error("[Queue:mock] Voice reanalysis failed:", err?.message?.slice(0, 200));
  }
}

export async function dispatchPostGeneration(_data: PostGenerationJobData): Promise<void> {
  console.log("[Queue:mock] Post generation dispatched");
}

export async function dispatchQualityCheck(_data: QualityCheckJobData): Promise<void> {
  console.log("[Queue:mock] Quality check dispatched");
}
