import { useRef, useState } from 'react'
import { adminService } from '../services/adminService'
import { adminError } from './useAdminData'

const CREATABLE_ROLE_IDS = ['data_engineer', 'data_scientist', 'business_user']

export function useAdminCreateUser(roles, onCreated) {
  const [form, setForm] = useState({ full_name: '', email: '', role_id: 'data_engineer' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const availableRoles = roles.filter((role) => CREATABLE_ROLE_IDS.includes(role.id))

  const updateField = (field, value) => {
    if (pending.current) return
    setForm((current) => ({ ...current, [field]: value }))
    setError('')
  }

  const submit = async (event) => {
    event.preventDefault()
    if (pending.current) return
    const payload = { full_name: form.full_name.trim(), email: form.email.trim(), role_id: form.role_id }
    if (!payload.full_name || !payload.email) {
      setError('Enter a full name and email address.')
      return
    }
    if (!availableRoles.some((role) => role.id === payload.role_id)) {
      setError('Select an available user role.')
      return
    }

    pending.current = true
    setSubmitting(true)
    setError('')
    let user
    try {
      user = await adminService.createUser(payload)
    } catch (err) {
      setError(adminError(err))
      return
    } finally {
      pending.current = false
      setSubmitting(false)
    }
    onCreated(user)
  }

  return { form, availableRoles, submitting, error, updateField, submit }
}
