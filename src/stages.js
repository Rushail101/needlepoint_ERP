export const STAGES = [
  { key: 'cutting', label: 'Cutting', color: 'bg-purple-900/50 text-purple-300' },
  { key: 'printing_embroidery', label: 'Printing/Embroidery', color: 'bg-blue-900/50 text-blue-300' },
  { key: 'stitching', label: 'Stitching', color: 'bg-cyan-900/50 text-cyan-300' },
  { key: 'qc', label: 'QC', color: 'bg-yellow-900/50 text-yellow-300' },
  { key: 'packed', label: 'Packed', color: 'bg-green-900/50 text-green-300' },
]

export function stageInfo(key) {
  return STAGES.find(s => s.key === key) || STAGES[0]
}
