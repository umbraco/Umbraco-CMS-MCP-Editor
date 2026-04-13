import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  initRedirectTestState,
  createElicitation,
  expectElicitationCancel,
} from "./setup.js";
import deleteRedirectTool from "../delete/delete-redirect.js";

const elicitation = createElicitation();

describe("delete-redirect", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let firstRedirectId: string | undefined;

  beforeAll(async () => {
    const state = await initRedirectTestState(extra);
    firstRedirectId = state.firstRedirectId;
  }, 60000);

  afterAll(() => { elicitation.cleanup(); });
  beforeEach(() => { elicitation.reset(); });

  it("should cancel delete-redirect when elicitation is rejected", async () => {
    const targetId = firstRedirectId || "00000000-0000-0000-0000-000000000001";

    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      deleteRedirectTool.handler({ id: targetId }, extra),
    );
  }, 30000);
});
