import { config } from "../config.js";
import { signWebhook } from "../security.js";

const body = process.argv[2];
if (!body) {
  console.error(
    'Usage: npm run webhook:sign -- \'{"id":"evt_1","type":"payment.status_changed","data":{"orderId":"<uuid>","status":"paid"}}\'',
  );
  process.exitCode = 1;
} else {
  const timestamp = String(Math.floor(Date.now() / 1000));
  console.log(
    JSON.stringify({
      timestamp,
      signature: `sha256=${signWebhook(config.WEBHOOK_SECRET, timestamp, body)}`,
      body,
    }),
  );
}
