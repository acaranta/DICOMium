import { create } from 'zustand'
import type { ToolId } from '../cornerstone/tools'

// Zustand rather than Context: window/level dragging fires on every mouse move, and
// putting that in Context would re-render the entire viewport grid on each event.

export interface Layout {
  rows: number
  cols: number
}

export const LAYOUTS: { id: string; label: string; layout: Layout }[] = [
  { id: '1x1', label: '1×1', layout: { rows: 1, cols: 1 } },
  { id: '1x2', label: '1×2', layout: { rows: 1, cols: 2 } },
  { id: '2x1', label: '2×1', layout: { rows: 2, cols: 1 } },
  { id: '2x2', label: '2×2', layout: { rows: 2, cols: 2 } },
  { id: '2x3', label: '2×3', layout: { rows: 2, cols: 3 } },
  { id: '3x3', label: '3×3', layout: { rows: 3, cols: 3 } },
]

export interface ViewportSlot {
  id: string
  seriesUid: string | null
}

export interface MeasurementStat {
  key: string
  value: string
  unit?: string
}

export interface Measurement {
  uid: string
  /** The Cornerstone tool name ("Length", "EllipticalROI"…). The display name is looked up
   *  from it in the translation catalogue, so it is a key, not prose. */
  toolName: string
  /** Labelled numbers, laid out as a grid by the panel. */
  stats: MeasurementStat[]
  imageId?: string
}

interface ViewerState {
  studyUid: string | null
  layout: Layout
  viewports: ViewportSlot[]
  activeViewportId: string
  activeTool: ToolId

  mprActive: boolean
  mprSeriesUid: string | null

  measurements: Measurement[]
  inspectorSopUid: string | null
  rightPanel: 'tags' | 'measurements' | null

  setStudy: (uid: string) => void
  setLayout: (layout: Layout) => void
  setActiveViewport: (id: string) => void
  setActiveTool: (tool: ToolId) => void
  assignSeries: (viewportId: string, seriesUid: string) => void
  enterMpr: (seriesUid: string) => void
  exitMpr: () => void
  setMeasurements: (m: Measurement[]) => void
  setInspectorSop: (sop: string | null) => void
  setRightPanel: (panel: 'tags' | 'measurements' | null) => void
  reset: () => void
}

function makeSlots(layout: Layout, previous: ViewportSlot[] = []): ViewportSlot[] {
  const count = layout.rows * layout.cols
  return Array.from({ length: count }, (_, i) => ({
    id: `vp-${i}`,
    // Keep whatever was already loaded in the slots that survive the layout change.
    seriesUid: previous[i]?.seriesUid ?? null,
  }))
}

const INITIAL_LAYOUT: Layout = { rows: 1, cols: 1 }

export const useViewerStore = create<ViewerState>((set, get) => ({
  studyUid: null,
  layout: INITIAL_LAYOUT,
  viewports: makeSlots(INITIAL_LAYOUT),
  activeViewportId: 'vp-0',
  activeTool: 'windowLevel',

  mprActive: false,
  mprSeriesUid: null,

  measurements: [],
  inspectorSopUid: null,
  rightPanel: null,

  setStudy: (uid) => set({ studyUid: uid }),

  setLayout: (layout) =>
    set((s) => {
      const viewports = makeSlots(layout, s.viewports)
      const active = viewports.some((v) => v.id === s.activeViewportId)
        ? s.activeViewportId
        : viewports[0].id
      return { layout, viewports, activeViewportId: active }
    }),

  setActiveViewport: (id) => set({ activeViewportId: id }),
  setActiveTool: (tool) => set({ activeTool: tool }),

  assignSeries: (viewportId, seriesUid) =>
    set((s) => ({
      viewports: s.viewports.map((v) => (v.id === viewportId ? { ...v, seriesUid } : v)),
      activeViewportId: viewportId,
    })),

  // MPR replaces the grid entirely: a volume viewport and a stack viewport cannot share
  // a tool group, so the 2D layout is torn down and rebuilt on exit.
  enterMpr: (seriesUid) => set({ mprActive: true, mprSeriesUid: seriesUid }),
  exitMpr: () => {
    const { layout } = get()
    set({
      mprActive: false,
      mprSeriesUid: null,
      viewports: makeSlots(layout, get().viewports),
    })
  },

  setMeasurements: (measurements) => set({ measurements }),
  setInspectorSop: (inspectorSopUid) => set({ inspectorSopUid }),
  setRightPanel: (rightPanel) => set({ rightPanel }),

  reset: () =>
    set({
      studyUid: null,
      layout: INITIAL_LAYOUT,
      viewports: makeSlots(INITIAL_LAYOUT),
      activeViewportId: 'vp-0',
      activeTool: 'windowLevel',
      mprActive: false,
      mprSeriesUid: null,
      measurements: [],
      inspectorSopUid: null,
      rightPanel: null,
    }),
}))
