'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'
import fragmentSource from './shader/fragment.glsl?raw'
import {
  useWeaveShader,
  type WeaveShaderOptions,
} from './shader/useWeaveShader'
import vertexSource from './shader/vertex.glsl?raw'

export interface WeaveCanvasProps {
  options?: WeaveShaderOptions
  className?: string
}

function WeaveCanvasInner({ options, className }: WeaveCanvasProps) {
  const { canvasRef, containerRef, error } = useWeaveShader(
    vertexSource,
    fragmentSource,
    options,
  )

  return (
    <div
      className={cn('relative h-full w-full overflow-hidden', className)}
      ref={containerRef}
    >
      <canvas className="block h-full w-full" ref={canvasRef} />
      {error ? (
        <div className="absolute inset-x-0 bottom-0 max-h-[120px] overflow-y-auto bg-black/70 p-2 font-mono text-red-300 text-xs leading-snug">
          {error}
        </div>
      ) : null}
    </div>
  )
}

export const WeaveCanvas = memo(WeaveCanvasInner)
