import { postDelivery } from 'assay/engine/connectors/handlers';

// A delivery is a scrape trigger: it must never be served from a cache, and it
// must never be prerendered.
export const dynamic = 'force-dynamic';
export const POST = postDelivery;
