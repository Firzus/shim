import {
  ErrorComponent,
  type ErrorComponentProps,
  Link,
  rootRouteId,
  useMatch,
  useRouter,
} from '@tanstack/react-router'

import { Button } from '@/components/ui/button'

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
      <h1 className="text-2xl font-semibold tracking-tight">something went wrong</h1>
      <ErrorComponent error={error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            void router.invalidate()
          }}
          variant="default"
          size="sm"
        >
          try again
        </Button>
        {isRoot ? (
          <Button render={<Link to="/" />} variant="outline" size="sm">
            home
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
            go back
          </Button>
        )}
      </div>
    </div>
  )
}
