import { describe, it, expect, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  MediaManagementBuilder,
  MediaManagementTestHelper,
} from "./setup.js";
import sortMediaChildrenTool from "../put/sort-media-children.js";
import listMediaChildrenTool from "../../media/get/list-media-children.js";

const PARENT_FOLDER = "_Test Sort Media Parent";
const CHILD_A = "_Test Sort Media A";
const CHILD_B = "_Test Sort Media B";

describe("sort-media-children", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  const createdIds: string[] = [];

  afterEach(async () => {
    while (createdIds.length > 0) {
      const id = createdIds.pop()!;
      await MediaManagementTestHelper.cleanup(id);
    }
  }, 30000);

  it("reorders two sibling media items inside a folder", async () => {
    const parent = await new MediaManagementBuilder().withName(PARENT_FOLDER).create();
    createdIds.push(parent.getId());

    const a = await new MediaManagementBuilder().withName(CHILD_A).asFile().withParent(parent.getId()).create();
    createdIds.push(a.getId());

    const b = await new MediaManagementBuilder().withName(CHILD_B).asFile().withParent(parent.getId()).create();
    createdIds.push(b.getId());

    const result = await sortMediaChildrenTool.handler(
      {
        parentId: parent.getId(),
        sorting: [
          { id: b.getId(), sortOrder: 0 },
          { id: a.getId(), sortOrder: 1 },
        ],
      },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.sorted).toBe(2);

    const childrenResult = await listMediaChildrenTool.handler({ parentId: parent.getId() }, extra);
    const children = getStructuredContent(childrenResult) as any;
    const orderedIds = (children.items ?? [])
      .filter((i: any) => i.id === a.getId() || i.id === b.getId())
      .map((i: any) => i.id);
    expect(orderedIds).toEqual([b.getId(), a.getId()]);
  }, 90000);
});
