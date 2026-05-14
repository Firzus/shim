import { ConvexHttpClient } from 'convex/browser'

// Self-hosted Convex deployment. Trust boundary is the docker network: port
// 3220 stays bound to 127.0.0.1, so server-only code calls Convex directly.

let cached: ConvexHttpClient | null = null

function resolveUrl(): string {
  const url =
    process.env.CONVEX_SELF_HOSTED_URL ?? process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL
  if (!url) {
    throw new Error(
      'CONVEX_SELF_HOSTED_URL or VITE_CONVEX_URL must be set (run `pnpm convex:deploy` once).',
    )
  }
  return url
}

function getClient(): ConvexHttpClient {
  if (!cached) cached = new ConvexHttpClient(resolveUrl())
  return cached
}

type Query = ConvexHttpClient['query']
type Mutation = ConvexHttpClient['mutation']
type Action = ConvexHttpClient['action']

export const convex = {
  query: ((...args) => getClient().query(...args)) as Query,
  mutation: ((...args) => getClient().mutation(...args)) as Mutation,
  action: ((...args) => getClient().action(...args)) as Action,
}
