import type { Route } from "next";

import type { RouteArgs, RouteOptions, RoutePattern } from "./types";

type ParamValue = string | readonly string[] | undefined;

const SEGMENT_PATTERN = /^\[(\[)?(\.\.\.)?([^\]]+)\]\]?$/;

function buildPath(pattern: string, params: Record<string, ParamValue>): string {
  const segments = pattern.split("/").flatMap((segment) => {
    const match = SEGMENT_PATTERN.exec(segment);
    if (!match) return [segment];

    const [, optional, catchAll, name] = match;
    const value = params[name];

    if (value === undefined || (Array.isArray(value) && value.length === 0)) {
      if (optional) return [];
      throw new Error(`route("${pattern}"): missing param "${name}"`);
    }

    if (catchAll) return (Array.isArray(value) ? value : [value]).map(encodeURIComponent);
    return [encodeURIComponent(String(value))];
  });

  return segments.join("/") || "/";
}

function buildSuffix({ query, hash }: RouteOptions = {}): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item !== null && item !== undefined) search.append(key, String(item));
    }
  }

  const queryString = search.toString();
  return `${queryString ? `?${queryString}` : ""}${hash ? `#${hash}` : ""}`;
}

/**
 * Builds a type-safe href from a Next.js route pattern.
 *
 * @example
 * route("/dashboard/finance");
 * route("/dashboard/finance", { query: { month: "2026-09" } });
 * route("/dashboard/[...not-found]", { "not-found": ["a", "b"] });
 */
export function route<R extends RoutePattern>(pattern: R, ...args: RouteArgs<R>): Route {
  // Mirrors `RouteArgs`: only dynamic patterns (containing `[`) take params before options.
  const [params, options] = (pattern.includes("[") ? args : [{}, ...args]) as unknown as [
    Record<string, ParamValue>,
    RouteOptions | undefined,
  ];

  return `${buildPath(pattern, params)}${buildSuffix(options)}` as Route;
}
