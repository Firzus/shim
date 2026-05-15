import {
  ErrorComponent,
  type ErrorComponentProps,
  Link,
  rootRouteId,
  useMatch,
  useRouter,
} from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { m } from '@/paraglide/messages'

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter()
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  })

  // eslint-disable-next-line no-console
  console.error('DefaultCatchBoundary caught:', error)

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{m.error_something_wrong()}</h1>
      <ErrorComponent error={error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            void router.invalidate()
          }}
          variant="default"
          size="sm"
        >
          {m.error_try_again()}
        </Button>
        {isRoot ? (
          <Button render={<Link to="/" />} variant="outline" size="sm">
            {m.error_home()}
          </Button>
        ) : (
          <Button
            render={
              <Link
                to="/"
                onClick={(event) => {
                  event.preventDefault()
                  window.history.back()
                }}
              />
            }
            variant="outline"
            size="sm"
          >
            {m.error_go_back()}
          </Button>
        )}
      </div>
    </div>
  )
}
