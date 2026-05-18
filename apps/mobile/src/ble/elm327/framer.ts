export const ELM_PROMPT = '>';

export interface FramerOptions {
  maxBufferBytes?: number;
}

const DEFAULT_MAX_BUFFER = 4096;

export class ResponseFramer {
  private buffer = '';
  private readonly maxBufferBytes: number;

  constructor(options: FramerOptions = {}) {
    this.maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER;
  }

  push(chunk: string): string[] {
    if (!chunk) return [];
    this.buffer += chunk;

    if (this.buffer.length > this.maxBufferBytes) {
      this.buffer = this.buffer.slice(-this.maxBufferBytes);
    }

    const frames: string[] = [];
    let idx = this.buffer.indexOf(ELM_PROMPT);
    while (idx !== -1) {
      frames.push(this.buffer.slice(0, idx));
      this.buffer = this.buffer.slice(idx + 1);
      idx = this.buffer.indexOf(ELM_PROMPT);
    }
    return frames;
  }

  reset(): void {
    this.buffer = '';
  }

  pending(): string {
    return this.buffer;
  }
}
