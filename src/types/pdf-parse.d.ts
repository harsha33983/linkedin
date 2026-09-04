declare module "pdf-parse" {
  export interface PDFParseOptions {
    data: Buffer | Uint8Array;
    [key: string]: unknown;
  }
  export interface TextResult {
    text: string;
    [key: string]: unknown;
  }
  export class PDFParse {
    constructor(options: PDFParseOptions);
    getText(params?: Record<string, unknown>): Promise<TextResult>;
    getInfo(params?: Record<string, unknown>): Promise<{ info?: unknown }>;
    destroy(): Promise<void>;
  }
}