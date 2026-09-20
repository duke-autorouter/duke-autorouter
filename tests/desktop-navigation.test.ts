import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { resource } from '../server/runtime.js';

test(
  'Mac window confines navigation and downloads to its service; explicit web links open externally',
  { skip: process.platform !== 'darwin' },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'duke-desktop-policy-'));
    try {
      const entry = join(directory, 'Checks.swift');
      const executable = join(directory, 'checks');
      await writeFile(
        entry,
        `
import Foundation
struct Check: Decodable { let base: String; let url: String; let mainFrame: Bool; let userActivated: Bool; let requestsDownload: Bool; let nativeControl: Bool? }
@main struct Checks {
    static func main() throws {
        let cases = try JSONDecoder().decode([Check].self, from: FileHandle.standardInput.readDataToEndOfFile())
        let results = cases.map { item -> String in
            guard let base = URL(string: item.base), let policy = DesktopNavigationPolicy(baseURL: base), let url = URL(string: item.url) else { return "invalid-base" }
            if item.nativeControl == true { return policy.allowsNativeControls(from: url, mainFrame: item.mainFrame) ? "native-allowed" : "native-blocked" }
            return policy.decision(for: url, mainFrame: item.mainFrame, userActivated: item.userActivated, requestsDownload: item.requestsDownload).rawValue
        }
        FileHandle.standardOutput.write(try JSONEncoder().encode(results))
    }
}
`,
      );
      execFileSync(
        '/usr/bin/xcrun',
        [
          'swiftc',
          '-parse-as-library',
          '-module-cache-path',
          join(directory, 'cache'),
          resource('desktop/NavigationPolicy.swift'),
          entry,
          '-o',
          executable,
        ],
        { timeout: 120_000 },
      );
      const base = 'http://127.0.0.1:4318';
      const checks = [
        { url: base + '/', nativeControl: true, expected: 'native-allowed' },
        { url: base + '/', nativeControl: true, mainFrame: false, expected: 'native-blocked' },
        { url: base + '/api/artifacts/example', nativeControl: true, expected: 'native-blocked' },
        { url: 'https://example.org/', nativeControl: true, expected: 'native-blocked' },
        { url: 'http://127.0.0.1:9999/', nativeControl: true, expected: 'native-blocked' },
        { url: 'file:///tmp/test.html', nativeControl: true, expected: 'native-blocked' },
        { url: 'blob:' + base + '/synthetic', nativeControl: true, expected: 'native-blocked' },
        { url: base + '/#launch=synthetic', expected: 'allow' },
        { url: base + '/api/artifacts/example', mainFrame: false, expected: 'allow' },
        {
          url: base + '/api/artifacts/example?download=1',
          requestsDownload: true,
          expected: 'download',
        },
        { url: 'blob:' + base + '/synthetic', requestsDownload: true, expected: 'download' },
        { url: 'blob:' + base + '/synthetic', expected: 'cancel' },
        { url: 'blob:https://example.org/synthetic', requestsDownload: true, expected: 'cancel' },
        { url: 'http://127.0.0.1:9999/', expected: 'cancel' },
        { url: 'http://127.0.0.1.example.org:4318/', expected: 'cancel' },
        { url: 'http://user@127.0.0.1:4318/', expected: 'cancel' },
        { url: 'https://auth.openai.com/', userActivated: true, expected: 'external' },
        { url: 'https://claude.ai/login', userActivated: true, expected: 'external' },
        { url: 'https://example.org/', expected: 'cancel' },
        {
          url: 'https://example.org/file',
          userActivated: true,
          requestsDownload: true,
          expected: 'cancel',
        },
        { url: 'file:///tmp/private.txt', userActivated: true, expected: 'cancel' },
        { url: 'javascript:alert(1)', userActivated: true, expected: 'cancel' },
        { url: 'data:text/html,example', userActivated: true, expected: 'cancel' },
        { url: 'about:blank', mainFrame: false, expected: 'allow' },
        { url: 'about:blank', expected: 'cancel' },
        ...[
          'https://127.0.0.1:4318',
          'http://localhost:4318',
          'http://127.0.0.1',
          base + '/elsewhere',
          base + '?query=1',
          base + '#fragment',
          'http://user@127.0.0.1:4318',
          'http://127.0.0.1:0',
        ].map((invalid) => ({ base: invalid, url: base, expected: 'invalid-base' })),
      ];
      const input = checks.map((check) => ({
        base,
        mainFrame: true,
        userActivated: false,
        requestsDownload: false,
        ...check,
      }));
      const result = JSON.parse(
        execFileSync(executable, {
          input: JSON.stringify(input),
          encoding: 'utf8',
          timeout: 10_000,
        }),
      );
      assert.deepEqual(
        result,
        checks.map((check) => check.expected),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
