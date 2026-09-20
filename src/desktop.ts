type FolderResult = { path?: string };
type FolderAPI = (path: string, body: unknown) => Promise<FolderResult>;

// The native window owns its dialog. Browser sessions retain the local helper.
export function chooseFolder(api: FolderAPI, purpose: 'project' | 'setup' = 'project') {
  const native = (
    window as Window & {
      webkit?: {
        messageHandlers?: {
          chooseFolder?: {
            postMessage: (body: { purpose: string }) => Promise<FolderResult>;
          };
        };
      };
    }
  ).webkit?.messageHandlers?.chooseFolder;
  return native ? native.postMessage({ purpose }) : api('/system/choose-folder', { purpose });
}
