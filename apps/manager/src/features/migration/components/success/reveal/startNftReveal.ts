import { getNftRevealProgress, NFT_REVEAL_DURATION } from './revealTiming'

const createFragments = (width: number, height: number) => {
  // Bound the work independently of screen resolution; DPR only affects pixels.
  const columns = 28
  const rows = 40
  const cellWidth = width / columns
  const cellHeight = height / rows
  return Array.from({ length: columns * rows * 2 }, (_, index) => {
    const cell = Math.floor(index / 2)
    const x = (cell % columns) * cellWidth
    const y = Math.floor(cell / columns) * cellHeight
    const points: readonly (readonly [number, number])[] =
      index % 2 === 0
        ? [
            [x, y],
            [x + cellWidth, y],
            [x, y + cellHeight],
          ]
        : [
            [x + cellWidth, y],
            [x + cellWidth, y + cellHeight],
            [x, y + cellHeight],
          ]
    const centerX = x + (cellWidth * (index % 2 === 0 ? 1 : 2)) / 3
    const centerY = y + (cellHeight * (index % 2 === 0 ? 1 : 2)) / 3
    const random = ((index * 16807 + 13) % 997) / 997
    return {
      points,
      centerX,
      centerY,
      delay:
        (centerY / height) * 1.53 +
        (1 - Math.abs((centerX / width) * 2 - 1)) * 0.2125 +
        random * 0.15,
      duration: 0.8 + random * 0.4,
      angle: (random - 0.5) * 0.6,
    }
  })
}

const drawFragments = (
  maskContext: CanvasRenderingContext2D,
  fragments: ReturnType<typeof createFragments>,
  time: number,
) => {
  for (const fragment of fragments) {
    const progress = Math.max(
      0,
      Math.min(1, (time - fragment.delay) / fragment.duration),
    )
    if (progress === 1) continue
    const scale = (1 - progress) ** 9
    const angle = fragment.angle * (1 - (1 - progress) ** 3)
    const cosine = Math.cos(angle) * scale
    const sine = Math.sin(angle) * scale
    for (let index = 0; index < fragment.points.length; index++) {
      const point = fragment.points[index]
      if (!point) continue
      const dx = point[0] - fragment.centerX
      const dy = point[1] - fragment.centerY
      const x = fragment.centerX + dx * cosine - dy * sine
      const y = fragment.centerY + dx * sine + dy * cosine
      if (index === 0) maskContext.moveTo(x, y)
      else maskContext.lineTo(x, y)
    }
    maskContext.closePath()
  }
}

/** Native, finite triangle dissolve inspired by the Design Atlas reveal. */
export const startNftReveal = (params: {
  readonly host: HTMLDivElement
  readonly mystery: HTMLImageElement
  readonly onComplete: () => void
}) => {
  const { host, onComplete } = params
  const canvas = document.createElement('canvas')
  const texture = document.createElement('canvas')
  const mask = document.createElement('canvas')
  const surfaces = [canvas, texture, mask]
  let frame = 0
  let disposed = false
  // Mutable canvas/RAF resources stay outside React and are released together.
  const dispose = () => {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frame)
    canvas.removeEventListener('contextlost', finish)
    canvas.remove()
    for (const surface of surfaces) {
      surface.width = 0
      surface.height = 0
    }
  }
  const finish = () => {
    if (disposed) return
    dispose()
    onComplete()
  }

  try {
    const width = host.clientWidth
    const height = host.clientHeight
    if (!width || !height) throw new Error('Reveal frame unavailable')
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    for (const surface of surfaces) {
      surface.width = Math.ceil(width * ratio)
      surface.height = Math.ceil(height * ratio)
    }
    const context = canvas.getContext('2d')
    const textureContext = texture.getContext('2d')
    const maskContext = mask.getContext('2d')
    if (!context || !textureContext || !maskContext)
      throw new Error('Reveal canvas unavailable')
    maskContext.scale(ratio, ratio)
    textureContext.scale(ratio, ratio)
    // Match the DOM placeholder's crop, including its transparent shadow bounds.
    // The opaque backing keeps the NFT hidden through holes in the mystery art.
    textureContext.fillStyle = '#ffe9f2'
    textureContext.fillRect(0, 0, width, height)
    const imageWidth = width * 1.0875
    textureContext.drawImage(
      params.mystery,
      -width * 0.0418,
      -height * 0.0089,
      imageWidth,
      (imageWidth * params.mystery.height) / params.mystery.width,
    )
    context.drawImage(texture, 0, 0)
    canvas.style.cssText = 'display:block;width:100%;height:100%'
    canvas.addEventListener('contextlost', finish)
    host.appendChild(canvas)
    const fragments = createFragments(width, height)
    const start = performance.now()
    const draw = (now: number) => {
      if (disposed) return
      const elapsed = now - start
      if (elapsed >= NFT_REVEAL_DURATION) {
        finish()
        return
      }
      try {
        const time = getNftRevealProgress(elapsed) * 3.13
        maskContext.clearRect(0, 0, width, height)
        maskContext.beginPath()
        // A single compound mask avoids thousands of clipped image draws per
        // frame. Only the local mystery texture is sampled, never remote NFT art.
        drawFragments(maskContext, fragments, time)
        maskContext.fill()
        context.globalCompositeOperation = 'source-over'
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.drawImage(texture, 0, 0)
        context.globalCompositeOperation = 'destination-in'
        context.drawImage(mask, 0, 0)
        frame = requestAnimationFrame(draw)
      } catch {
        finish()
      }
    }
    frame = requestAnimationFrame(draw)
    return dispose
  } catch (cause) {
    dispose()
    throw cause
  }
}
