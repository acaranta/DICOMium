// Window/level presets.
//
// These are the standard radiology windows, expressed as (width, centre) in Hounsfield
// units. They only mean anything for CT, where pixel values are calibrated to HU — for MR
// and everything else the sensible default is the window the scanner recorded in the
// file, falling back to the actual data range.

export interface WlPreset {
  id: string
  label: string
  width: number
  center: number
  /** Modalities this preset is meaningful for. */
  modalities: string[]
}

export const WL_PRESETS: WlPreset[] = [
  { id: 'soft', label: 'Soft tissue', width: 400, center: 40, modalities: ['CT'] },
  { id: 'lung', label: 'Lung', width: 1500, center: -600, modalities: ['CT'] },
  { id: 'bone', label: 'Bone', width: 2000, center: 500, modalities: ['CT'] },
  { id: 'brain', label: 'Brain', width: 80, center: 40, modalities: ['CT'] },
  { id: 'abdomen', label: 'Abdomen', width: 400, center: 50, modalities: ['CT'] },
  { id: 'liver', label: 'Liver', width: 150, center: 30, modalities: ['CT'] },
  { id: 'mediastinum', label: 'Mediastinum', width: 350, center: 50, modalities: ['CT'] },
  { id: 'angio', label: 'Angio', width: 600, center: 300, modalities: ['CT'] },
]

export function presetsFor(modality: string): WlPreset[] {
  return WL_PRESETS.filter((p) => p.modalities.includes(modality))
}

/** Cornerstone's setProperties takes a low/high range, not width/centre. */
export function toVoiRange(width: number, center: number): { lower: number; upper: number } {
  return { lower: center - width / 2, upper: center + width / 2 }
}

export function fromVoiRange(lower: number, upper: number): { width: number; center: number } {
  return { width: upper - lower, center: (upper + lower) / 2 }
}
