import { invoke } from "@tauri-apps/api/core";

export type TreeEntry = {
  name: string;
  path: string;
  directory: boolean;
  children?: TreeEntry[];
};

export type WorkspaceInfo = {
  root: string;
  welcome: string;
};

/** Creates `~/Documents/Typist` and `Welcome.md` when they are missing. */
export const initializeWorkspace = () => invoke<WorkspaceInfo>("initialize_workspace");

/** Lists the workspace tree. All filesystem access is scoped by the Rust side. */
export const listNotes = () => invoke<TreeEntry[]>("list_notes");

export const readNote = (path: string) => invoke<string>("read_note", { path });

export const writeNote = (path: string, contents: string) =>
  invoke<void>("write_note", { path, contents });

export const createNote = (directory?: string) =>
  invoke<string>("create_note", { directory: directory ?? null });

export const createFolder = (directory?: string) =>
  invoke<string>("create_folder", { directory: directory ?? null });

/** Returns the new path so the caller can follow an open note through a rename. */
export const renameEntry = (path: string, name: string) =>
  invoke<string>("rename_entry", { path, name });

export const deleteEntry = (path: string) => invoke<void>("delete_entry", { path });
