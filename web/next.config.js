/** @type {import('next').NextConfig} */
export default {
  // No transpilePackages and no externalDir: the root `exports` map makes
  // `assay/engine/*` a real specifier, so nothing needs a build-time escape hatch.
};
