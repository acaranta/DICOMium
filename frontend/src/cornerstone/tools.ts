// The UI-button-to-Cornerstone-tool map, in one place.

import {
  WindowLevelTool,
  PanTool,
  ZoomTool,
  LengthTool,
  AngleTool,
  RectangleROITool,
  EllipticalROITool,
  ProbeTool,
  EraserTool,
} from '@cornerstonejs/tools'

export type ToolId =
  | 'windowLevel'
  | 'pan'
  | 'zoom'
  | 'length'
  | 'angle'
  | 'rectangleRoi'
  | 'ellipseRoi'
  | 'probe'
  | 'eraser'

export const TOOL_NAMES: Record<ToolId, string> = {
  windowLevel: WindowLevelTool.toolName,
  pan: PanTool.toolName,
  zoom: ZoomTool.toolName,
  length: LengthTool.toolName,
  angle: AngleTool.toolName,
  rectangleRoi: RectangleROITool.toolName,
  ellipseRoi: EllipticalROITool.toolName,
  probe: ProbeTool.toolName,
  eraser: EraserTool.toolName,
}

/** Tools that create annotations — these must go passive, not disabled, when deselected,
 *  or existing measurements would stop rendering. */
export const ANNOTATION_TOOLS: ToolId[] = [
  'length',
  'angle',
  'rectangleRoi',
  'ellipseRoi',
  'probe',
]

export interface ToolDef {
  id: ToolId
  label: string
  hint: string
  key: string
}

export const TOOLBAR: ToolDef[] = [
  { id: 'windowLevel', label: 'Window/Level', hint: 'Drag to adjust brightness & contrast', key: 'w' },
  { id: 'pan', label: 'Pan', hint: 'Drag to move the image', key: 'p' },
  { id: 'zoom', label: 'Zoom', hint: 'Drag to zoom', key: 'z' },
  { id: 'length', label: 'Length', hint: 'Measure a distance in mm', key: 'l' },
  { id: 'angle', label: 'Angle', hint: 'Measure an angle', key: 'a' },
  { id: 'rectangleRoi', label: 'Rectangle ROI', hint: 'Region statistics (mean, min, max, SD)', key: 'r' },
  { id: 'ellipseRoi', label: 'Ellipse ROI', hint: 'Region statistics (mean, min, max, SD)', key: 'e' },
  { id: 'probe', label: 'Probe', hint: 'Read the value at a point', key: 'b' },
  { id: 'eraser', label: 'Erase', hint: 'Delete a measurement', key: 'x' },
]
