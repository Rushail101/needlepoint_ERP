// src/permissions.js
export const ROLES = {
  admin: {
    label: 'Admin',
    can: [
      'view_orders',
      'create_orders',
      'edit_garments',
      'delete_garments',
      'manage_garment_catalog',
      'view_financials',
      'log_work',
      'view_work_logs',
      'manage_employees',
      'manage_brands',
      'manage_pins',
    ],
  },
  manager: {
    label: 'Manager',
    can: [
      'view_orders',
      'create_orders',
      'edit_garments',
      'manage_garment_catalog',
      'view_financials',
      'log_work',
      'view_work_logs',
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
  if (!user || !user.role) return false
  const roleConfig = ROLES[user.role.toLowerCase()]
  if (!roleConfig) return false
  return roleConfig.can.includes(action)
}
