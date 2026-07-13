// Exporting a viewport as PNG.
//
// The pixels live on Cornerstone's canvas, but the measurements do NOT: they are drawn
// into a separate SVG overlay layered on top of it. A naive canvas.toDataURL() therefore
// exports the image with every annotation missing — which is exactly the thing the user
// wanted to capture.
//
// So we composite: canvas first, then the serialized SVG rasterized on top.

import type { Types } from '@cornerstonejs/core'

export async function captureViewport(
  viewport: Types.IStackViewport | Types.IVolumeViewport,
  element: HTMLElement,
  filename: string,
): Promise<void> {
  const source = viewport.getCanvas()
  const out = document.createElement('canvas')
  out.width = source.width
  out.height = source.height

  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('could not get a 2d context')

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(source, 0, 0)

  const svg = element.querySelector('svg')
  if (svg) {
    await drawSvg(ctx, svg, out.width, out.height)
  }

  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('could not encode the PNG')

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`
  link.click()
  URL.revokeObjectURL(url)
}

async function drawSvg(
  ctx: CanvasRenderingContext2D,
  svg: SVGElement,
  width: number,
  height: number,
): Promise<void> {
  const clone = svg.cloneNode(true) as SVGElement
  // The live SVG is sized by CSS; a serialized one needs explicit dimensions or it
  // rasterizes at zero size.
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  const markup = new XMLSerializer().serializeToString(clone)
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`

  await new Promise<void>((resolve) => {
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height)
      resolve()
    }
    // A broken overlay must not lose the user their image — export it without.
    img.onerror = () => resolve()
    img.src = url
  })
}
