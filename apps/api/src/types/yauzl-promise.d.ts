declare module 'yauzl-promise' {
  export type YauzlEntry = { filename: string };

  export type YauzlZip = AsyncIterable<YauzlEntry> & {
    close(): Promise<void>;
  };

  const yauzl: {
    fromBuffer(buffer: Buffer): Promise<YauzlZip>;
  };

  export default yauzl;
}
