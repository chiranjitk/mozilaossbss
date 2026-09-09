// Test preload: neutralise the "server-only" RSC guard so server modules
// (policy/billing engines) can be unit-tested with `bun test`.
import { mock } from "bun:test";

mock.module("server-only", () => ({}));
