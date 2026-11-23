import axios from 'axios'
import apiClient from './apiClient'

// This client has no application auth interceptor. AWS receives only its signed URL.
const s3Client = axios.create({ withCredentials: false })
const basePath = '/datasets/direct-upload'
const MAX_CONCURRENT_PARTS = 4
const PART_URL_BATCH_SIZE = 16

export async function uploadDirectToS3(files, metadata, onProgress) {
  const cleanMetadata = Object.fromEntries(Object.entries(metadata)
    .filter(([, value]) => value?.trim()).map(([key, value]) => [key, value.trim()]))
  const { data: session } = await apiClient.post(basePath, {
    ...cleanMetadata, files: files.map((file) => ({ filename: file.name, size: file.size })),
  })
  const total = files.reduce((size, file) => size + file.size, 0)
  let completedBytes = 0
  const controller = new AbortController()
  const report = (loaded, phase = 's3') => onProgress?.({ loaded, total, phase })
  report(0)
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      const ticket = session.files[index]
      const filePath = `${basePath}/${session.job_id}/files/${ticket.file_id}`
      const partCount = Math.ceil(file.size / ticket.part_size)
      const parts = new Array(partCount)
      const transferred = new Array(partCount).fill(0)
      const urlBatches = new Map()
      const partUrl = async (partIndex, refresh) => {
        if (refresh) {
          const { data } = await apiClient.post(filePath + '/parts', {
            part_numbers: [partIndex + 1],
          }, { signal: controller.signal })
          return data.parts[0].url
        }
        const start = Math.floor(partIndex / PART_URL_BATCH_SIZE) * PART_URL_BATCH_SIZE
        if (!urlBatches.has(start)) {
          // Workers share a signing request; fetch the next group only when needed.
          const partNumbers = Array.from({ length: Math.min(PART_URL_BATCH_SIZE, partCount - start) }, (_, offset) => start + offset + 1)
          urlBatches.set(start, apiClient.post(filePath + '/parts', {
            part_numbers: partNumbers,
          }, { signal: controller.signal }).then(({ data }) => new Map(data.parts.map((part) => [part.part_number, part.url]))))
        }
        const urls = await urlBatches.get(start)
        const url = urls.get(partIndex + 1)
        if (!url) throw new Error('Không nhận được URL tải lên S3 cho phần dữ liệu.')
        return url
      }
      const updateProgress = () => report(completedBytes + transferred.reduce((sum, value) => sum + value, 0))
      let nextPart = 0
      const transferPart = async () => {
        while (nextPart < partCount) {
          const partIndex = nextPart++
          const body = file.slice(partIndex * ticket.part_size, Math.min(file.size, (partIndex + 1) * ticket.part_size))
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              const url = await partUrl(partIndex, attempt > 0)
              const response = await s3Client.put(url, body, {
                signal: controller.signal, headers: { 'Content-Type': 'text/csv' },
                onUploadProgress: (event) => {
                  transferred[partIndex] = Math.min(body.size, event.loaded)
                  updateProgress()
                },
              })
              const etag = response.headers.etag
              if (!etag) throw new Error('S3 không trả về ETag. Kiểm tra cấu hình CORS của bucket.')
              parts[partIndex] = { part_number: partIndex + 1, etag }
              transferred[partIndex] = body.size
              updateProgress()
              break
            } catch (error) {
              if (controller.signal.aborted || attempt === 2) throw error
              transferred[partIndex] = 0
              updateProgress()
              await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 300))
            }
          }
        }
      }
      const workers = Array.from({ length: Math.min(MAX_CONCURRENT_PARTS, partCount) }, () => transferPart())
      const outcomes = await Promise.allSettled(workers.map((worker) => worker.catch((error) => {
        controller.abort()
        throw error
      })))
      const failed = outcomes.find((outcome) => outcome.status === 'rejected')
      if (failed) throw failed.reason
      await apiClient.post(filePath + '/complete', { parts })
      completedBytes += file.size
    }
    report(total, 'confirming')
    return (await apiClient.post(`${basePath}/${session.job_id}/complete`)).data
  } catch (error) {
    // A lost completion response must not delete a batch already accepted by BE.
    try {
      const { data: job } = await apiClient.get(`/datasets/upload/jobs/${session.job_id}`)
      if (['QUEUED', 'RUNNING', 'COMPLETED'].includes(job.status)) return job
      await apiClient.delete(`${basePath}/${session.job_id}`)
    } catch { /* Backend retains ownership and expiration information for cleanup. */ }
    if (!error.response && !axios.isCancel(error)) {
      throw new Error('Không thể tải trực tiếp lên S3. Kiểm tra kết nối và CORS (PUT, ETag) của bucket.')
    }
    throw error
  }
}
