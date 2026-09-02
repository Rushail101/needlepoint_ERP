// Single source of truth for what each role can do.
// admin          — everything, including managing floor manager / worker access
// floor_manager  — logs and edits work, manages sample versions, updates order stage
// worker         — view-only on Garments, Orders, and Brands

const RULES = {
  admin: [
    'view_brands', 'view_team', 'view_access', 'view_pricing',
    'edit_garments', 'delete_garments', 'manage_sizes', 'manage_photos',
    'manage_garment_catalog', 'manage_brands', 'manage_team',
    'manage_work_logs', 'manage_samples', 'change_stage', 'manage_access', 'export_pdf',
  ],
  floor_manager: [
    'manage_work_logs', 'manage_samples', 'change_stage', 'export_pdf',
  ],
  worker: [
    'view_brands',
  ],
}

export function can(user, action) {
  const role = user?.role || 'worker'
  return (RULES[role] || []).includes(action)
}
