/** `2026-11-23T10:00:00.123456789Z ` — what the API asks Docker to put in front of every log line. */
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z /

/**
 * The log stream arrives in chunks that do not end on line boundaries, and
 * every line starts with a Docker timestamp. This hands back whole lines
 * (timestamp removed unless `keep`), holding a partial last line until the
 * rest arrives; `flush()` releases whatever is left when the stream ends.
 */
export class LogLines {
  private pending = ''

  constructor(private readonly keepTimestamps = false) {}

  flush(): string {
    const rest = this.pending
    this.pending = ''
    return rest ? this.format(rest) : ''
  }

  push(chunk: string): string {
    const text = this.pending + chunk
    const cut = text.lastIndexOf('\n')
    if (cut === -1) {
      this.pending = text
      return ''
    }

    this.pending = text.slice(cut + 1)
    return this.format(text.slice(0, cut + 1))
  }

  private format(text: string): string {
    if (this.keepTimestamps) return text
    return text
      .split('\n')
      .map((line) => line.replace(TIMESTAMP, ''))
      .join('\n')
  }
}
