// Minimal types for the parts of subset-font used by scripts/subset-fonts.mjs.
declare module "subset-font" {
  interface SubsetFontOptions {
    targetFormat?: "sfnt" | "woff" | "woff2" | "truetype";
    preserveNameIds?: number[];
    variationAxes?: Record<
      string,
      number | { min: number; max: number; default?: number }
    >;
  }

  export default function subsetFont(
    buffer: Uint8Array,
    text: string,
    options?: SubsetFontOptions,
  ): Promise<Buffer>;
}
