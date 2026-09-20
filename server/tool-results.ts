export type ToolImage = { mimeType: 'image/png' | 'image/jpeg'; data: string; label?: string };
export function splitToolResult(value: any): { text: string; images: ToolImage[] } {
  if (!value || Array.isArray(value) || typeof value !== 'object' || !Array.isArray(value.images))
    return { text: JSON.stringify(value), images: [] };
  const { images, ...rest } = value;
  return { text: JSON.stringify(rest), images };
}
export function codexToolContent(value: any) {
  const { text, images } = splitToolResult(value);
  return [
    { type: 'inputText' as const, text },
    ...images.map((image) => ({
      type: 'inputImage' as const,
      imageUrl: `data:${image.mimeType};base64,${image.data}`,
    })),
  ];
}
export function claudeToolContent(value: any) {
  const { text, images } = splitToolResult(value);
  return [
    { type: 'text' as const, text },
    ...images.map((image) => ({
      type: 'image' as const,
      mimeType: image.mimeType,
      data: image.data,
    })),
  ];
}
export function toolReceipt(value: any) {
  if (!value?.images) return value;
  return {
    ...value,
    images: value.images.map(({ data, ...image }: ToolImage) => ({
      ...image,
      bytes: Buffer.from(data, 'base64').length,
    })),
  };
}
