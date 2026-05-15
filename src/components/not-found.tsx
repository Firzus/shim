import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { m } from '@/paraglide/messages'

type NotFoundProps = {
  children?: ReactNode
}

export function NotFound({ children }: NotFoundProps) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{m.notfound_title()}</h1>
      <div className="text-sm text-muted-foreground">{children ?? <p>{m.notfound_desc()}</p>}</div>
      <Button render={<Link to="/" />} variant="outline" size="sm">
        {m.notfound_go_home()}
      </Button>
    </div>
  )
}
