import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
} from "./setup.js";
import listMediaTypesTool from "../get/list-media-types.js";

describe("list-media-types", () => {
  setupTestEnvironment();

  it(
    "should list allowed media types at root",
    async () => {
      const extra = createMockRequestHandlerExtra();

      const result = await listMediaTypesTool.handler(
        { parentId: undefined },
        extra,
      );

      expect(createSnapshotResult(result)).toMatchSnapshot();
    },
    30000,
  );
});
