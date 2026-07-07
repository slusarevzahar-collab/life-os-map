import { createSignal } from './notionAdapter.js';
import { persistSignalAnalysis } from './inboxAssetStore.js';

export async function createAiSignal(args) {
  const result = await createSignal(args);
  if (!result?.id) return result;
  try {
    const analysisResult = await persistSignalAnalysis({
      notionToken: args.notionToken,
      signalId: result.id,
      analysis: args.payload || {},
    });
    return { ...result, assistantNoteStored: true, assetsStored: analysisResult.assets };
  } catch {
    return { ...result, assistantNoteStored: false, assetsStored: 0 };
  }
}
