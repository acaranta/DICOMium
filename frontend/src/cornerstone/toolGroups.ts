// Tool groups and mouse bindings.
//
// The bindings follow the Weasis/OHIF convention, which radiologists already have in
// their fingers:
//
//   left   -> the active tool (Window/Level by default)
//   right  -> zoom
//   middle -> pan
//   wheel  -> scroll the stack
//
// StackScrollMouseWheelTool was removed in Cornerstone 2.x. Wheel scrolling is now
// StackScrollTool bound to MouseBindings.Wheel.

import { Enums, ToolGroupManager } from '@cornerstonejs/tools'
import { CrosshairsTool } from '@cornerstonejs/tools'
import { RENDERING_ENGINE_ID } from './init'
import { ANNOTATION_TOOLS, TOOL_NAMES, type ToolId } from './tools'

const { MouseBindings } = Enums

export const STACK_TOOL_GROUP = 'webdicom-stack'
export const MPR_TOOL_GROUP = 'webdicom-mpr'

/** Bindings that are always live, whatever the active tool is. */
function addBaseBindings(group: ReturnType<typeof ToolGroupManager.createToolGroup>) {
  if (!group) return
  group.addTool(TOOL_NAMES.pan)
  group.addTool(TOOL_NAMES.zoom)
  group.addTool('StackScroll')

  group.setToolActive(TOOL_NAMES.zoom, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  })
  group.setToolActive(TOOL_NAMES.pan, {
    bindings: [{ mouseButton: MouseBindings.Auxiliary }],
  })
  group.setToolActive('StackScroll', {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  })
}

export function createStackToolGroup() {
  destroyToolGroup(STACK_TOOL_GROUP)
  const group = ToolGroupManager.createToolGroup(STACK_TOOL_GROUP)
  if (!group) throw new Error('could not create the stack tool group')

  addBaseBindings(group)

  // Every annotation tool is added up front and left passive; setActiveTool promotes one
  // of them to the primary button. Passive (not disabled) keeps existing annotations
  // rendered and editable while a different tool is selected.
  group.addTool(TOOL_NAMES.windowLevel)
  for (const id of ANNOTATION_TOOLS) group.addTool(TOOL_NAMES[id])
  group.addTool(TOOL_NAMES.eraser)

  setActiveTool(STACK_TOOL_GROUP, 'windowLevel')
  return group
}

export function createMprToolGroup() {
  destroyToolGroup(MPR_TOOL_GROUP)
  const group = ToolGroupManager.createToolGroup(MPR_TOOL_GROUP)
  if (!group) throw new Error('could not create the MPR tool group')

  addBaseBindings(group)
  group.addTool(TOOL_NAMES.windowLevel)
  for (const id of ANNOTATION_TOOLS) group.addTool(TOOL_NAMES[id])
  group.addTool(TOOL_NAMES.eraser)

  group.addTool(CrosshairsTool.toolName, {
    getReferenceLineColor,
    getReferenceLineControllable: () => true,
    getReferenceLineDraggableRotatable: () => true,
    getReferenceLineSlabThicknessControlsOn: () => true,
  })
  return group
}

/** The radiology convention for reference-line colours, keyed by viewport. */
const MPR_COLORS: Record<string, string> = {
  'mpr-axial': 'rgb(239, 68, 68)',
  'mpr-sagittal': 'rgb(234, 179, 8)',
  'mpr-coronal': 'rgb(34, 197, 94)',
}

function getReferenceLineColor(viewportId: string): string {
  return MPR_COLORS[viewportId] ?? 'rgb(200, 200, 200)'
}

/**
 * Promote one tool to the primary mouse button.
 *
 * Everything else that draws goes passive rather than disabled — disabling would hide
 * annotations the user has already placed.
 */
export function setActiveTool(groupId: string, toolId: ToolId) {
  const group = ToolGroupManager.getToolGroup(groupId)
  if (!group) return

  for (const id of ANNOTATION_TOOLS) group.setToolPassive(TOOL_NAMES[id])
  group.setToolPassive(TOOL_NAMES.windowLevel)
  group.setToolDisabled(TOOL_NAMES.eraser)

  group.setToolActive(TOOL_NAMES[toolId], {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  })
}

export function setCrosshairsActive(groupId: string, active: boolean) {
  const group = ToolGroupManager.getToolGroup(groupId)
  if (!group) return
  if (active) {
    group.setToolActive(CrosshairsTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    })
  } else {
    group.setToolDisabled(CrosshairsTool.toolName)
  }
}

/** Viewports MUST be added to the group before setToolActive, or the crosshairs tool has
 *  nothing to compute reference lines against and silently does nothing. */
export function addViewports(groupId: string, viewportIds: string[]) {
  const group = ToolGroupManager.getToolGroup(groupId)
  if (!group) return
  for (const id of viewportIds) group.addViewport(id, RENDERING_ENGINE_ID)
}

export function destroyToolGroup(groupId: string) {
  if (ToolGroupManager.getToolGroup(groupId)) {
    ToolGroupManager.destroyToolGroup(groupId)
  }
}
