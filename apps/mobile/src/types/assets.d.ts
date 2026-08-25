/**
 * Static image assets as importable modules.
 *
 * Metro resolves `import art from './art.webp'` to an opaque asset handle that
 * `<Image source={...}>` accepts, but nothing in the Expo or React Native type
 * packages declares the shape, so TypeScript would reject the import.
 */
declare module '*.png' {
  const asset: number;
  export default asset;
}

declare module '*.webp' {
  const asset: number;
  export default asset;
}
