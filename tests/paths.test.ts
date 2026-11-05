import { describe, expect, test } from "bun:test";
import { basename, dirname, isWithin, remapPath } from "../src/lib/paths";

describe("path helpers", () => {
  test("reads the file name from unix and windows paths", () => {
    expect(basename("/home/ada/Documents/Typist/Welcome.md")).toBe("Welcome.md");
    expect(basename("C:\\Users\\ada\\Documents\\Typist\\Ideas.md")).toBe("Ideas.md");
    expect(basename("Welcome.md")).toBe("Welcome.md");
  });

  test("reads the parent folder from unix and windows paths", () => {
    expect(dirname("/home/ada/Documents/Typist/Welcome.md")).toBe(
      "/home/ada/Documents/Typist",
    );
    expect(dirname("C:\\Users\\ada\\Documents\\Typist\\Ideas.md")).toBe(
      "C:\\Users\\ada\\Documents\\Typist",
    );
    expect(dirname("/home/ada/Documents/Typist/Nested/Note.md")).toBe(
      "/home/ada/Documents/Typist/Nested",
    );
  });

  test("treats a trailing separator as part of the folder", () => {
    expect(dirname("/home/ada/Documents/Typist/")).toBe("/home/ada/Documents");
  });

  test("follows a renamed folder without matching a sibling prefix", () => {
    expect(isWithin("/notes/Ideas.md", "/notes")).toBe(true);
    expect(isWithin("/notes/Ideas.md", "/note")).toBe(false);

    expect(remapPath("/notes/Ideas.md", "/notes", "/archive")).toBe("/archive/Ideas.md");
    expect(remapPath("/notes-2025/Ideas.md", "/notes", "/archive")).toBe(
      "/notes-2025/Ideas.md",
    );
  });
});
