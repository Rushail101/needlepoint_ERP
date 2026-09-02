export const WORK_TYPES = [
  { key: 'screen_printing', label: 'Screen Printing', icon: '🖨️' },
  { key: 'embroidery', label: 'Embroidery', icon: '🧵' },
  { key: 'sampling', label: 'Sampling', icon: '✂️' },
  { key: 'sample_change', label: 'Sample Change', icon: '🔁' },
  { key: 'stitching', label: 'Stitching', icon: '🪡' },
  { key: 'other', label: 'Other', icon: '📌' },
]

export const WORK_TYPE_LABEL = Object.fromEntries(WORK_TYPES.map(w => [w.key, w.label]))
