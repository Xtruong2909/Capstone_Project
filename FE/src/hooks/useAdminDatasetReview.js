import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminService } from '../services/adminService'
import { invalidateAdminResourceCache } from '../services/adminResourceCache'
import { useAdminMutation, useAdminResource } from './useAdminData'

export function useAdminDatasetReview() {
  const resource = useAdminResource(adminService.getReviewGroups)
  const [params, setParams] = useSearchParams()
  const groupId = params.get('groupId')
  const [search, setSearchValue] = useState('')
  const [requestedPage, setPage] = useState(1)
  const [pageSize, setSize] = useState(10)
  const [previewItem, setPreview] = useState(null)
  const [review, setReview] = useState(null)
  const [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(null)
  const guard = useRef({ active: true, busy: false })
  const mutation = useAdminMutation()
  useEffect(() => {
    const current = { active: true, busy: false }
    guard.current = current
    return () => { current.active = false }
  }, [])
  // Hide a confirmed decision only until the refreshed API response arrives.
  const groups = (resource.data || []).filter((item) => item.submitted_datasets > 0
    && !(confirmed?.snapshot === resource.data && confirmed.groupId === item.group_id))
  const group = groups.find((item) => item.group_id === groupId)
  const datasets = useAdminResource(adminService.getReviewDatasets, { group_id: groupId }, Boolean(group))
  const filtered = groups.filter((item) => [item.group_name, item.drone_id]
    .some((value) => value?.toLowerCase().includes(search.trim().toLowerCase())))
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(filtered.length / pageSize)))
  const openGroup = (item) => {
    const next = new URLSearchParams(params)
    if (item) next.set('groupId', item.group_id)
    else next.delete('groupId')
    next.delete('datasetId'); next.delete('fileId')
    setParams(next)
    setPreview(null)
  }
  const openReview = (item, status) => {
    if (guard.current.busy || !item?.submitted_datasets) return
    mutation.clear(); setNote(''); setPreview(null); setReview({ item, status })
  }
  const confirmReview = async (event) => {
    event.preventDefault()
    const current = guard.current
    if (!review || current.busy || !current.active) return
    current.busy = true
    const { item, status } = review
    try {
      await mutation.run(() => adminService.reviewBatch(item.group_id,
        { status, note: note.trim() || null }), () => {
        if (!current.active) return
        setConfirmed({ snapshot: resource.data, groupId: item.group_id })
        setReview(null); openGroup(null)
        invalidateAdminResourceCache()
        resource.reload()
      }, `${status === 'APPROVED' ? 'Đã phê duyệt' : 'Đã từ chối'} các tập dữ liệu chờ duyệt trong batch ${item.group_name || item.drone_id}.`)
    } finally { current.busy = false }
  }
  return { resource, groups, group, groupId, datasets, openGroup,
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length, page, pageSize, setPage, search,
    setSearch: (value) => { setSearchValue(value); setPage(1) },
    setPageSize: (value) => { setSize(value); setPage(1) },
    previewItem, openPreview: setPreview, closePreview: () => setPreview(null), review, note, setNote,
    closeReview: () => { if (!guard.current.busy) setReview(null) }, openReview, confirmReview, mutation,
    reload: () => { resource.reload(); if (group) datasets.reload() },
  }
}

export function useAdminReviewPreview(item) {
  const [sessionPage, setSessionPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [page, setPage] = useState(1)
  const [representation, setRepresentation] = useState('normalized')
  const [columnOffsets, setColumnOffsets] = useState([0])
  const sessions = useAdminResource(adminService.getReviewSessions,
    { group_id: item.group_id, dataset_id: item.dataset_id, page: sessionPage, page_size: 10 })
  const session = sessions.data?.sessions.find((row) => row.session_id === selected) || sessions.data?.sessions[0]
  const columnOffset = columnOffsets[columnOffsets.length - 1]
  const preview = useAdminResource(adminService.getReviewSessionPreview, {
    group_id: item.group_id, dataset_id: item.dataset_id, session_id: session?.session_id,
    page, limit: 10, representation, column_offset: columnOffset,
  }, Boolean(session))
  const resetPage = () => { setPage(1); setColumnOffsets([0]) }
  return { sessions, sessionPage,
    setSessionPage: (value) => { setSessionPage(value); setSelected(null); resetPage() },
    session, setSession: (value) => { setSelected(value); resetPage() },
    representation, setRepresentation: (value) => { setRepresentation(value); resetPage() },
    preview, page, setPage, columnOffset,
    previousColumns: () => { setColumnOffsets((offsets) => offsets.slice(0, -1)); setPage(1) },
    nextColumns: () => {
      if (preview.data?.has_more_columns) {
        setColumnOffsets((offsets) => [...offsets, columnOffset + preview.data.columns.length]); setPage(1)
      }
    },
  }
}
