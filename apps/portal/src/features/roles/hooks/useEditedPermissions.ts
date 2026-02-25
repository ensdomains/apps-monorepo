import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useEffect, useState } from 'react'
import {
  type Permission,
  roleToPermissions,
} from '@/lib/roles/rolesToPermissions'

type RolePermissionState = {
  admin: boolean
  manager: boolean
}

export const useEditedPermissions = (
  row: { original: { items: string[]; account: string } } | null,
) => {
  const [editedPermissions, setEditedPermissions] = useState<
    Map<string, RolePermissionState>
  >(new Map())

  useEffect(() => {
    if (row) {
      const roles = (row.original.items ?? []) as Role[]
      setEditedPermissions(roleToPermissions(roles) as Map<string, Permission>)
    }
  }, [row])

  return { editedPermissions, setEditedPermissions }
}
