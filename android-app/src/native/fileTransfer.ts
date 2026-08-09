import { NativeModules } from 'react-native';

export interface PickedFile {
  uri: string;
  name?: string;
  size?: number;
  mimeType?: string;
}

interface FileTransferNative {
  pickFile(): Promise<PickedFile | null>;
  readChunk(uri: string, offset: number, length: number): Promise<string>;
  beginReceive(fileName: string): Promise<string>;
  appendChunk(token: string, base64: string): Promise<void>;
  finishReceive(token: string, fileName: string, mimeType: string): Promise<string>;
  abortReceive(token: string): void;
}

const native = NativeModules.FileTransfer as FileTransferNative | undefined;

function required(): FileTransferNative {
  if (!native) throw new Error('FileTransfer native module unavailable');
  return native;
}

export const FileTransfer = {
  pickFile: () => required().pickFile(),
  readChunk: (uri: string, offset: number, length: number) =>
    required().readChunk(uri, offset, length),
  beginReceive: (fileName: string) => required().beginReceive(fileName),
  appendChunk: (token: string, base64: string) => required().appendChunk(token, base64),
  finishReceive: (token: string, fileName: string, mimeType: string) =>
    required().finishReceive(token, fileName, mimeType),
  abortReceive: (token: string) => native?.abortReceive(token),
};
