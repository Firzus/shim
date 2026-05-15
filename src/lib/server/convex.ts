import { ConvexHttpClient } from 'convex/browser'

// Self-hosted Convex deployment. Trust boundary is the docker network: port
// 3220 stays bound to 127.0.0.1, so server-only code calls Convex directly.

let cached: ConvexHttpClient | null = null

// Defaults to the host loopback; the `app` container overrides it with the
// docker-network DNS name (CONVEX_SELF_HOSTED_URL=http://convex:3210).
const CONVEX_URL = process.env.CONVEX_SELF_HOSTED_URL ?? 'http://127.0.0.1:3220'

function getClient(): ConvexHttpClient {
  if (!cached) cached = new ConvexHttpClient(CONVEX_URL)
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
