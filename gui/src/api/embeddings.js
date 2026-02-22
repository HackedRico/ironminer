import { api } from './client'

/**
 * Run NVIDIA Grounding DINO on a frame.
 * @param {string} imageB64 — base64 JPEG (no data URI prefix)
 * @returns {Promise<Array<{bbox: number[], label: string, confidence: number}>>}
 */
export const detectObjects = (imageB64) =>
  api('/api/embeddings/detect', {
    method: 'POST',
    body: JSON.stringify({ image_b64: imageB64 }),
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
