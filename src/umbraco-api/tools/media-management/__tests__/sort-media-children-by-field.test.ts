import { describe, it, expect, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  MediaManagementBuilder,
  MediaManagementTestHelper,
} from "./setup.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import sortMediaChildrenByFieldTool from "../put/sort-media-children-by-field.js";
import listMediaChildrenTool from "../../media/get/list-media-children.js";

const PARENT_FOLDER = "_Test SortByField Media Parent";
const ALPHA = "_Test SortByField Media Alpha";
const ZULU = "_Test SortByField Media Zulu";

describe("sort-media-children-by-field", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  const createdIds: string[] = [];

  afterEach(async () => {
    while (createdIds.length > 0) {
      const id = createdIds.pop()!;
      await MediaManagementTestHelper.cleanup(id);
    }
  }, 30000);

  it("sorts a folder's children by name ascending and descending", async () => {
    const parent = await new MediaManagementBuilder().withName(PARENT_FOLDER).create();
    createdIds.push(parent.getId());

    // Create Zulu first so the default (sortOrder) order is the opposite of A-Z.
    const zulu = await new MediaManagementBuilder().withName(ZULU).asFile().withParent(parent.getId()).create();
    createdIds.push(zulu.getId());

    const alpha = await new MediaManagementBuilder().withName(ALPHA).asFile().withParent(parent.getId()).create();
    createdIds.push(alpha.getId());

    const orderOfTestItems = async (): Promise<string[]> => {
      const childrenResult = await callTool(listMediaChildrenTool, { parentId: parent.getId() }, extra);
      const children = getStructuredContent(childrenResult) as any;
      return (children.items ?? [])
        .filter((i: any) => i.id === alpha.getId() || i.id === zulu.getId())
        .map((i: any) => i.id);
    };

    expect(await orderOfTestItems()).toEqual([zulu.getId(), alpha.getId()]);

    const ascResult = await callTool(
      sortMediaChildrenByFieldTool,
      { parentId: parent.getId(), field: "Name", direction: "Ascending" },
      extra,
    );
    expect(ascResult.isError).toBeFalsy();
    const ascData = getStructuredContent(ascResult) as any;
    expect(ascData.field).toBe("Name");
    expect(ascData.direction).toBe("Ascending");
    expect(ascData.sorted).toBe(2);
    expect(ascData.items.map((i: any) => i.id)).toEqual([alpha.getId(), zulu.getId()]);

    expect(await orderOfTestItems()).toEqual([alpha.getId(), zulu.getId()]);

    const descResult = await callTool(
      sortMediaChildrenByFieldTool,
      { parentId: parent.getId(), field: "Name", direction: "Descending" },
      extra,
    );
    expect(descResult.isError).toBeFalsy();
    const descData = getStructuredContent(descResult) as any;
    expect(descData.direction).toBe("Descending");

    expect(await orderOfTestItems()).toEqual([zulu.getId(), alpha.getId()]);
  }, 120000);
});
