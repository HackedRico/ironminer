/**
 * Full pipeline: summary → safety + productivity in one request.
 * To revert to per-agent calls, use api/safety.js runSafetyAnalysis + api/productivity.js runProductivityAnalysis instead.
 */
import { api } from './client'

export const runFullAnalysis = (siteId, videoJobId, summaryText = null) =>
  api('/api/pipeline/run', {
    method: 'POST',
    body: JSON.stringify({
      site_id: siteId,
      video_job_id: videoJobId,
      ...(summaryText != null && summaryText !== '' ? { summary_text: summaryText } : {}),
    }),
    signal: AbortSignal.timeout(90000), // pipeline can take 60s+ (Gemini)
  })
