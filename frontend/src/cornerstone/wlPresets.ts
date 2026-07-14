// Window/level presets.
//
// These are the standard radiology windows, expressed as (width, centre) in Hounsfield units.
// They only mean anything for CT, where pixel values are calibrated to HU — for MR and
// everything else the sensible default is the window the scanner recorded in the file.
//
// The NUMBERS are universal; only the names are translated (locales/*/viewer.json →
// presets.*). Note these are established radiological terms, not literal translations: French
// says *Parenchyme pulmonaire*, not *Poumon*.

export type PresetId =
  | 'soft'
  | 'lung'
  | 'bone'
  | 'brain'
  | 'abdomen'
  | 'liver'
  | 'mediastinum'
  | 'angio'

export interface WlPreset {
  id: PresetId
  width: number
  center: number
  /** Modalities this preset is meaningful for. */
  modalities: string[]
}

export const WL_PRESETS: WlPreset[] = [
  { id: 'soft', width: 400, center: 40, modalities: ['CT'] },
  { id: 'lung', width: 1500, center: -600, modalities: ['CT'] },
  { id: 'bone', width: 2000, center: 500, modalities: ['CT'] },
  { id: 'brain', width: 80, center: 40, modalities: ['CT'] },
  { id: 'abdomen', width: 400, center: 50, modalities: ['CT'] },
  { id: 'liver', width: 150, center: 30, modalities: ['CT'] },
  { id: 'mediastinum', width: 350, center: 50, modalities: ['CT'] },
  { id: 'angio', width: 600, center: 300, modalities: ['CT'] },
]

export function presetsFor(modality: string): WlPreset[] {
  return WL_PRESETS.filter((p) => p.modalities.includes(modality))
}

/** Cornerstone's setProperties takes a low/high range, not width/centre. */
export function toVoiRange(width: number, center: number): { lower: number; upper: number } {
  return { lower: center - width / 2, upper: center + width / 2 }
}
