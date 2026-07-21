/**
 * Unit tests for the media-upload-helpers module.
 *
 * These tests are pure — they do not hit the CMS or the network, so they run
 * without a live Umbraco instance.
 */

import { describe, it, expect } from "@jest/globals";
import { normalizeFileUrl } from "../media-upload-helpers.js";

describe("normalizeFileUrl", () => {
  it("rewrites a Drive file/view share link to the direct-download endpoint", () => {
    const input = "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view?usp=sharing";
    expect(normalizeFileUrl(input)).toBe(
      "https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOpQrSt&export=download",
    );
  });

  it("rewrites a Drive file/view share link with no trailing query string", () => {
    const input = "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view";
    expect(normalizeFileUrl(input)).toBe(
      "https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOpQrSt&export=download",
    );
  });

  it("rewrites a Drive open?id= link", () => {
    const input = "https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrSt";
    expect(normalizeFileUrl(input)).toBe(
      "https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOpQrSt&export=download",
    );
  });

  it("rewrites a Drive uc?id= link", () => {
    const input = "https://drive.google.com/uc?id=1AbCdEfGhIjKlMnOpQrSt";
    expect(normalizeFileUrl(input)).toBe(
      "https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOpQrSt&export=download",
    );
  });

  it("rewrites a Drive uc?export=download&id= link", () => {
    const input = "https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQrSt";
    expect(normalizeFileUrl(input)).toBe(
      "https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOpQrSt&export=download",
    );
  });

  it("URL-encodes an id containing special characters", () => {
    const input = "https://drive.google.com/uc?id=abc def";
    expect(normalizeFileUrl(input)).toBe(
      "https://drive.usercontent.google.com/download?id=abc%20def&export=download",
    );
  });

  it("leaves an already-normalized direct-download URL unchanged", () => {
    const input = "https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOpQrSt&export=download";
    expect(normalizeFileUrl(input)).toBe(input);
  });

  it("leaves a non-Drive URL unchanged", () => {
    const input = "https://example.com/files/photo.png";
    expect(normalizeFileUrl(input)).toBe(input);
  });

  it("leaves an unrecognised Drive path unchanged", () => {
    const input = "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrSt";
    expect(normalizeFileUrl(input)).toBe(input);
  });

  it("leaves an open/uc link with no id param unchanged", () => {
    const openInput = "https://drive.google.com/open";
    const ucInput = "https://drive.google.com/uc";
    expect(normalizeFileUrl(openInput)).toBe(openInput);
    expect(normalizeFileUrl(ucInput)).toBe(ucInput);
  });

  it("leaves a Dropbox share link unchanged (out of scope)", () => {
    const input = "https://www.dropbox.com/s/abc123/file.png?dl=0";
    expect(normalizeFileUrl(input)).toBe(input);
  });

  it("returns malformed input unchanged rather than throwing", () => {
    const input = "not a url";
    expect(normalizeFileUrl(input)).toBe(input);
  });
});
