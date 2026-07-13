// Cine playback for multi-frame series (ultrasound loops, XA runs, cardiac MR).

import { utilities } from '@cornerstonejs/tools'

export const DEFAULT_FPS = 20

export function play(element: HTMLDivElement, framesPerSecond = DEFAULT_FPS) {
  utilities.cine.playClip(element, { framesPerSecond })
}

export function stop(element: HTMLDivElement) {
  utilities.cine.stopClip(element)
}
