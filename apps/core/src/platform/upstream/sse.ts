/** One event of a text/event-stream. */
export interface SseEvent {
  event: string;
  data: string;
  id?: string;
}

/**
 * Reads a text/event-stream response body (fetch) event by event. Ends when
 * the upstream closes the stream or the response's signal aborts.
 */
export async function* readSse(res: Response): AsyncGenerator<SseEvent> {
  if (!res.body) return;
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx: number;
    while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, '');
      const ev: SseEvent = { event: 'message', data: '' };
      const data: string[] = [];
      for (const line of raw.split(/\r?\n/)) {
        if (!line || line.startsWith(':')) continue;
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
        if (field === 'data') data.push(value);
        else if (field === 'event') ev.event = value;
        else if (field === 'id') ev.id = value;
      }
      if (!data.length) continue;
      ev.data = data.join('\n');
      yield ev;
    }
  }
}
