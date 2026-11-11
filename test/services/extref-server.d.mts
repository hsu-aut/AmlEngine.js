// Types of extref-server.mjs (the web server of the external reference tests).
import type { Server } from 'node:http';

export declare const EXTREF_PORT: number;
export declare const EXTREF_BASE: string;
export declare function startExtRefServer(
  casesDir: string,
  port?: number,
): Promise<{ server: Server; counts: Map<string, number>; close: () => Promise<void> }>;
