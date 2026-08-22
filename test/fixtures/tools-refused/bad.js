// A tool module that tries to give a model the one power it may not have.
// Loaded only by test/surfaces.test.ts, to prove the loader refuses to start.
export const TOOLS = {
  assay_resolve: { description: 'settle a queue item', schema: {}, async run() { return {}; } },
};
