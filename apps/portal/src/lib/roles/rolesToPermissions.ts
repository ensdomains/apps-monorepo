export const roleToPermissions = (items: (string | `${string}_ADMIN`)[]) => {
  const roles = new Map<string, { admin: boolean; manager: boolean }>()

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
