export type Permission = { admin: boolean; manager: boolean }

export const roleToPermissions = (
  items: (string | `${string}_ADMIN`)[],
): Map<string, Permission> => {
  const roles = new Map<string, Permission>()

  for (const item of items) {
    const adminPostfixIndex = item.indexOf('_ADMIN')
    if (adminPostfixIndex !== -1) {
      const base = item.slice(0, adminPostfixIndex)
      roles.set(base, {
        admin: true,
        manager: roles.get(base)?.manager || false,
      })
    } else {
      roles.set(item, {
        admin: roles.get(item)?.admin || false,
        manager: true,
      })
    }
  }

  return roles
}

export const hasPermissionsChanged = (
  original: Map<string, Permission>,
  edited: Map<string, Permission>,
): boolean => {
  // Check all keys in original
  for (const [key, originalPerm] of original) {
    const editedPerm = edited.get(key)
    if (
      !editedPerm ||
      originalPerm.admin !== editedPerm.admin ||
      originalPerm.manager !== editedPerm.manager
    ) {
      return true
    }
  }

  // Check if there are new permissions in edited that weren't in original
  for (const [key, editedPerm] of edited) {
    const originalPerm = original.get(key)
    if (
      !originalPerm ||
      originalPerm.admin !== editedPerm.admin ||
      originalPerm.manager !== editedPerm.manager
    ) {
      return true
    }
  }

  return false
}
