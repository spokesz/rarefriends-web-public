import assert from "node:assert/strict";
import { test } from "node:test";
import { metadataReadPolicy, protocolReadPolicy, retryCancelledRead } from "../src/features/protocol/query-policy.ts";

test("a read the browser cancelled is read again, up to three times", () => {
  const cancelled = new DOMException("The user aborted a request.", "AbortError");
  assert.equal(retryCancelledRead(0, cancelled), true);
  assert.equal(retryCancelledRead(2, cancelled), true);
  assert.equal(retryCancelledRead(3, cancelled), false);
});

test("real read failures still surface immediately", () => {
  assert.equal(retryCancelledRead(0, new Error("Holdings are unavailable right now. Refresh to try again.")), false);
  assert.equal(retryCancelledRead(0, new DOMException("signal timed out", "TimeoutError")), false);
});

test("every display read shares the cancelled-read retry", () => {
  assert.equal(protocolReadPolicy("/portfolio", true).retry, retryCancelledRead);
  assert.equal(protocolReadPolicy("/", false).retry, retryCancelledRead);
  assert.equal(metadataReadPolicy.retry, retryCancelledRead);
});
