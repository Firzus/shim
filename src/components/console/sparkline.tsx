// A bare SVG sparkline of hourly request volume — gives the activity panel a
// sense of shape and rhythm that four flat numbers cannot. Decorative detail
// only (the numeric stats carry the data), so it draws itself in on mount.

import { useRef } from 'react'

import type { Analytics } from '@/lib/api/types'
import { m } from '@/paraglide/messages'
import { gsap, prefersMotion, useGSAP } from '@/lib/gsap'
import { cn } from '@/lib/utils'

type HourBucket = Analytics['hourly'][number]

const W = 240
const H = 40
const PAD = 3

export function Sparkline({
  data,
  animate = false,
  className,
}: {
  data: HourBucket[]
  animate?: boolean
  className?: string
}) {
  const ref = useRef<SVGSVGElement>(null)

  useGSAP(
    () => {
      if (!animate || !prefersMotion()) return
      const path = ref.current?.querySelector('[data-spark-line]')
      if (!path) return
      // fromTo sets the hidden state pre-paint (useGSAP is a layout effect),
      // so there's no flash; without JS the path renders fully drawn.
      gsap.fromTo(
        path,
        { strokeDashoffset: 1 },
        { strokeDashoffset: 0, duration: 1.1, ease: 'power2.out' },
      )
    },
    { scope: ref },
  )

  if (data.length < 2) return null

  const max = Math.max(1, ...data.map((d) => d.requests))
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - PAD - (d.requests / max) * (H - PAD * 2),
    errors: d.errors,
  }))
  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')
  const area = `${line} L ${W} ${H} L 0 ${H} Z`

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={m.activity_sparkline_label()}
      className={cn('h-10 w-full', className)}
    >
      <path d={area} fill="var(--color-primary)" fillOpacity={0.08} stroke="none" />
      <path
        data-spark-line
        d={line}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        vectorEffect="non-scaling-stroke"
      />
      {/* Error buckets get a crisp vertical tick. A circle would shear into
          an ellipse under preserveAspectRatio="none"; a vertical line with a
          non-scaling stroke stays true. */}
      {points.map((p, i) =>
        p.errors > 0 ? (
          <line
            key={i}
            x1={p.x}
            y1={p.y - 2.5}
            x2={p.x}
            y2={p.y + 2.5}
            stroke="var(--color-destructive)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ) : null,
      )}
    </svg>
  )
}
