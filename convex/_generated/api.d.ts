/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as helpers from '../helpers.js'
import type * as oauthTokens from '../oauthTokens.js'
import type * as pkceState from '../pkceState.js'
import type * as requests from '../requests.js'
import type * as shimSettings from '../shimSettings.js'

import type { ApiFromModules, FilterApi, FunctionReference } from 'convex/server'

declare const fullApi: ApiFromModules<{
  helpers: typeof helpers
  oauthTokens: typeof oauthTokens
  pkceState: typeof pkceState
  requests: typeof requests
  shimSettings: typeof shimSettings
}>

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, 'public'>>

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, 'internal'>>

export declare const components: {}
