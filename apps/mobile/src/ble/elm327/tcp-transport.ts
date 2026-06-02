import TcpSocket from 'react-native-tcp-socket';
import type { ElmTransport } from './transport';

export interface TcpElmTransportConfig {
  host: string;
  port: number;
  /** Connection timeout in ms before failing the initial connect. */
  connectTimeoutMs?: number;
}

export const DEFAULT_TCP_ELM_CONFIG: TcpElmTransportConfig = {
  host: '192.168.0.10',
  port: 35000,
  connectTimeoutMs: 5000,
};

export class TcpElmTransport implements ElmTransport {
  private socket: ReturnType<typeof TcpSocket.createConnection> | null = null;
  private dataListener: ((chunk: string) => void) | null = null;

  constructor(private readonly config: TcpElmTransportConfig) {}

  async connect(): Promise<void> {
    const { host, port, connectTimeoutMs = 5000 } = this.config;
    return new Promise((resolve, reject) => {
      const socket = TcpSocket.createConnection(
        { host, port, tls: false },
        () => {
          this.socket = socket;
          resolve();
        },
      );
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`TCP connect to ${host}:${port} timed out after ${connectTimeoutMs}ms`));
      }, connectTimeoutMs);
      socket.on('connect', () => clearTimeout(timer));
      socket.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      socket.on('data', (data) => {
        if (!this.dataListener) return;
        const chunk = typeof data === 'string' ? data : data.toString('ascii');
        this.dataListener(chunk);
      });
    });
  }

  async write(payload: string): Promise<void> {
    if (!this.socket) throw new Error('TCP transport not connected');
    this.socket.write(payload);
  }

  subscribe(onData: (chunk: string) => void): () => void {
    this.dataListener = onData;
    return () => {
      if (this.dataListener === onData) this.dataListener = null;
    };
  }

  async close(): Promise<void> {
    this.dataListener = null;
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}
