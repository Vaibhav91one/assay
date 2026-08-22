// Two feature branches, same tool name. The loader must not silently merge.
export const TOOLS = {
  assay_status: { description: 'first claim', schema: {}, async run() { return {}; } },
};
