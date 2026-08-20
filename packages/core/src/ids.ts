/** Injected so tests get predictable identifiers. */
export type IdSource = () => string

export function sequentialIds(prefix: string): IdSource {
  let n = 0
  return () => {
    n += 1
    return `${prefix}-${n}`
  }
}
