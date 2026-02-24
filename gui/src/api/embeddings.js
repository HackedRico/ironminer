import { api } from './client'

/**
 * Run NVIDIA Grounding DINO on a frame.
 * @param {string} imageB64 — base64 JPEG (no data URI prefix)
 * @returns {Promise<Array<{bbox: number[], label: string, confidence: number}>>}
 */
export const detectObjects = (imageB64, prompt) =>
  api('/api/embeddings/detect', {
    method: 'POST',
    body: JSON.stringify({ image_b64: imageB64, prompt: prompt || null }),
    signal: AbortSignal.timeout(300_000), // 5 min — handles NVIDIA cold starts
  })

/**
 * Crop bbox, create NV-CLIP embedding, attach note, persist.
 * @param {{ feed_id, site_id, worker_identity, frame_b64, bbox, label, note, audio_b64 }} payload
 * @returns {Promise<EmbeddedObject>}
 */
export const embedObject = (payload) =>
  api('/api/embeddings/embed', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000), // embedding + optional Parakeet transcription
  })

/**
 * Fetch all embedded objects recorded for a specific worker.
 * @param {string} workerIdentity
 */
export const fetchWorkerEmbeddings = (workerIdentity) =>
  api(`/api/embeddings/worker/${encodeURIComponent(workerIdentity)}`)

/**
 * Fetch all embedded objects recorded on a specific feed.
 * @param {string} feedId
 */
export const fetchFeedEmbeddings = (feedId) =>
  api(`/api/embeddings/feed/${encodeURIComponent(feedId)}`)

/**
 * Embed the current frame with NV-CLIP and return stored objects ranked by
 * cosine similarity — best visual match first.
 * @param {string} frameB64   — base64 JPEG (no data URI prefix)
 * @param {string|null} workerId  — scope to this worker's objects
 * @param {string|null} feedId    — fallback scope
 * @returns {Promise<Array<{embedded_object, similarity}>>}
 */
export const findSimilarObjects = (frameB64, workerId, feedId) =>
  api('/api/embeddings/similar', {
    method: 'POST',
    body: JSON.stringify({
      frame_b64: frameB64,
      worker_identity: workerId || null,
      feed_id: feedId || null,
      top_k: 1,
    }),
    signal: AbortSignal.timeout(120_000),
  })
