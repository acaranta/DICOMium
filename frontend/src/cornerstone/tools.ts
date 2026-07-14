// The UI-button-to-Cornerstone-tool map, in one place.
//
// Labels, hints AND keyboard shortcuts all live in the translation catalogue
// (locales/*/viewer.json → tools.*). The shortcut is translated too, deliberately: `W` for
// "Window/Level" is a mnemonic that stops being one the moment the tool is called *Fenêtrage*,
// and on an AZERTY keyboard `W` and `Z` are not even in the same place. Each locale picks
// letters that mean something to the people who read that locale.

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

/** Tools that create annotations — these must go passive, not disabled, when deselected, or
 *  existing measurements would stop rendering. */
export const ANNOTATION_TOOLS: ToolId[] = [
  'length',
  'angle',
  'rectangleRoi',
  'ellipseRoi',
  'probe',
]

/** Toolbar order. Everything else about a tool — its name, its tooltip, its key — comes from
 *  the catalogue. */
export const TOOLBAR: ToolId[] = [
  'windowLevel',
  'pan',
  'zoom',
  'length',
  'angle',
  'rectangleRoi',
  'ellipseRoi',
  'probe',
  'eraser',
]
