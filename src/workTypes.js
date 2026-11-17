// `progress` marks the work types that move pieces forward and are counted per
// size on the garment page. `qc` entries also carry rejected pieces.
export const WORK_TYPES = [
  { key: 'cutting', label: 'Cutting', icon: '✂️', progress: true },
  { key: 'screen_printing', label: 'Screen Printing', icon: '🖨️', progress: true },
  { key: 'embroidery', label: 'Embroidery', icon: '🧵', progress: true },
  { key: 'stitching', label: 'Stitching', icon: '🪡', progress: true },
  { key: 'qc', label: 'QC Check', icon: '🔍', progress: true },
  { key: 'packing', label: 'Packing', icon: '📦', progress: true },
  { key: 'alteration', label: 'Alteration / Rework', icon: '🔧' },
  { key: 'sampling', label: 'Sampling', icon: '🧪' },
  { key: 'sample_change', label: 'Sample Change', icon: '🔁' },
  { key: 'other', label: 'Other', icon: '📌' },
]

export const WORK_TYPE_LABEL = Object.fromEntries(WORK_TYPES.map(w => [w.key, w.label]))
export const PROGRESS_TYPES = WORK_TYPES.filter(w => w.progress).map(w => w.key)

export const REJECT_REASONS = ['Stitching defect', 'Print / embroidery defect', 'Measurement off', 'Fabric fault', 'Stain / dirty', 'Wrong colour / trim', 'Other']
