import { postTest } from 'assay/engine/connectors/handlers';

// Answers 502 when a delivery failed. A test that reports 200 while Slack
// answered 404 certifies a dead endpoint, which is worse than no test.
export const dynamic = 'force-dynamic';
export const POST = postTest;
