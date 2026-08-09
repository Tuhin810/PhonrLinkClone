/**
 * react-native-zeroconf ships no type declarations. This covers only the surface we use;
 * extend it rather than reaching for `any` if a later phase needs more.
 */
declare module 'react-native-zeroconf' {
  export interface ZeroconfService {
    name?: string;
    fullName?: string;
    host?: string;
    port?: number;
    addresses?: string[];
    txt?: Record<string, unknown>;
  }

  type ZeroconfEvent =
    | 'start'
    | 'stop'
    | 'found'
    | 'resolved'
    | 'remove'
    | 'update'
    | 'error';

  export default class Zeroconf {
    scan(type?: string, protocol?: string, domain?: string): void;
    stop(): void;
    removeDeviceListeners(): void;
    getServices(): Record<string, ZeroconfService>;
    on(event: 'resolved' | 'found' | 'update', handler: (service: ZeroconfService) => void): void;
    on(event: 'remove', handler: (name: string) => void): void;
    on(event: 'error', handler: (error: Error) => void): void;
    on(event: ZeroconfEvent, handler: (...args: unknown[]) => void): void;
  }
}
