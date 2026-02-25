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
  const originalRoles = (row?.original.items ?? []) as Role[]

  const [editedPermissions, setEditedPermissions] = useState<
    Map<string, RolePermissionState>
  >(new Map())

  useEffect(() => {
    if (row) {
      const rolePermissionsMap = roleToPermissions(originalRoles)
      setEditedPermissions(rolePermissionsMap as Map<string, Permission>)
    }
  }, [row, originalRoles])

  return { editedPermissions, setEditedPermissions }
}
