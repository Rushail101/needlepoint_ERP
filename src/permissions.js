export const ROLES = {
  admin: {
    label: 'Admin',
    can: [
      'view_brands',
      'view_team',
      'manage_work_logs',
      'view_access',
      'view_orders',
      'create_orders',
      'edit_garments',
      'delete_garments',
      'manage_garment_catalog',
      'view_financials',
      'log_work',
      'manage_employees',
      'manage_brands',
      'manage_pins',
    ],
  },
  manager: {
    label: 'Manager',
    can: [
      'view_brands',
      'view_team',
      'manage_work_logs',
      'view_orders',
      'create_orders',
      'edit_garments',
      'manage_garment_catalog',
      'view_financials',
      'log_work',
    ],
  },
  tailor: {
    label: 'Tailor',
    can: ['view_orders', 'log_work'],
  },
  client: {
    label: 'Client',
    can: [
      'view_orders',
      'create_orders',
      'manage_garment_catalog',
      'view_financials',
    ],
  },
}

export function can(user, action) {
  if (!user) return false
  const role = String(user.role || '').toLowerCase()

  // Master override: Admin always has access to all actions and tabs
  if (role === 'admin' || user.name === 'Admin') return true

  const roleConfig = ROLES[role]
  if (!roleConfig) return false
  return roleConfig.can.includes(action)
}
