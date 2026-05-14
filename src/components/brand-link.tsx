import { Link } from '@tanstack/react-router'

import { cn } from '@/lib/utils'

export function BrandLink({
  className,
  textClassName,
}: {
  className?: string
  textClassName?: string
}) {
  return (
    <Link to="/" className={cn('flex items-center gap-2.5', className)}>
      <img
        src="/logo-mark-24.webp"
        srcSet="/logo-mark-48.webp 2x, /logo-mark-96.webp 4x"
        alt=""
        className="size-6"
        width={24}
        height={24}
      />
      <span className={cn('font-mono font-bold tracking-tight', textClassName)}>shim</span>
    </Link>
  )
}
