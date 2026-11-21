import { useState } from 'react'

export function useBusinessResourceNavigation(detail, resourceType) {
  const [selection, setSelection] = useState(null)
  const resources = (detail?.resources || []).filter((resource) => resource.resource_type === resourceType)
  const selectedResource = selection?.shareId === detail?.share_id && selection?.type === resourceType
    ? resources.find((resource) => resource.item_id === selection.itemId) || null
    : null
  const selectResource = (itemId) => setSelection(itemId
    ? { shareId: detail.share_id, type: resourceType, itemId }
    : null)
  return { resources, selectedResource, selectResource }
}
