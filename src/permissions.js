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
      'edit_financials', // Admin only
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
      'log_work',
      'view_dashboard',
      'manage_materials',
      'manage_job_work',
      'log_qc',
      // 'view_financials' and 'edit_financials' removed
    ],
  },
  tailor: {
    label: 'Tailor',
    can: ['view_orders', 'log_work'],   // workers: see orders, log their own work
  },
  client: {
    label: 'Client',
    can: [
      'view_orders',
      'create_orders',
      'manage_garment_catalog',
      'view_financials', // Read-only viewing
    ],
  },
}

// The Access screen creates 'floor_manager' and 'worker' logins, but the roles
// above are 'manager' and 'tailor' — so those logins had no permissions at all.
const ROLE_ALIASES = { floor_manager: 'manager', worker: 'tailor' }
export const normRole = r => { const x = String(r || '').toLowerCase(); return ROLE_ALIASES[x] || x }

export function can(user, action) {
  if (!user) return false
  const role = normRole(user.role)
  if (role === 'admin') return true

  const roleConfig = ROLES[role]
  if (!roleConfig) return false
  return roleConfig.can.includes(action)
}
