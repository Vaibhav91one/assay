// Target sites. Verified against Wayback CDX 2026-08-20 -- see PLAN.md 2b.
// Three manufacturers (the scrape target) + one regulator API (the oracle).

export const SITES = [
  {
    id: 'mattel',
    name: 'Mattel / Fisher-Price',
    url: 'https://service.mattel.com/us/recall.aspx',
    stack: 'legacy ASP.NET',
  },
  {
    id: 'ikea',
    name: 'IKEA US',
    url: 'https://www.ikea.com/us/en/customer-service/product-support/recalls/',
    stack: 'modern listing + per-recall detail pages',
  },
  {
    id: 'chicco',
    name: 'Chicco USA',
    url: 'https://www.chiccousa.com/child-safety/product-recalls/',
    stack: 'ecommerce CMS',
  },
];

// Backup if one of the three fails on day 1. Went stale after 2026-04 (URL move?),
// which is why it is not primary.
export const BACKUP = {
  id: 'graco',
  name: 'Graco',
  url: 'https://recalls.gracobaby.com/',
  stack: 'standalone recall lookup app',
};

// The oracle. NOT a scrape: cpsc.gov/Recalls returns 403 behind a WAF even with a
// browser UA. CPSC publishes this free unauthenticated REST API instead, which is
// strictly better -- the oracle cannot break the same way the target does.
export const ORACLE = {
  id: 'cpsc',
  name: 'CPSC',
  api: 'https://www.saferproducts.gov/RestWebServices/Recall',
};
