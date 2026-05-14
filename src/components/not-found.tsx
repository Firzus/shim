import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'

type NotFoundProps = {
  children?: ReactNode
}

export function NotFound({ children }: NotFoundProps) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">404 — not found</h1>
      <div className="text-sm text-muted-foreground">
        {children ?? <p>the page you’re looking for does not exist.</p>}
      </div>
      <Button render={<Link to="/" />} variant="outline" size="sm">
        go home
      </Button>
    </div>
  )
}
