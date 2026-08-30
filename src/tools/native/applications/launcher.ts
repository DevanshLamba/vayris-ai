import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ─── Types ────────────────────────────────────────────────────────
export type AppType = 'executable' | 'shortcut' | 'uri';

export interface ResolveResult {
  found: boolean;
  displayName: string;
  source: string;        // 'alias' | 'StartApps' | 'PATH' | 'unknown'
  targetType: AppType;
  validatedTarget: string;
}

// ─── Known Aliases (instant, zero-lookup) ─────────────────────────
// These bypass Get-StartApps entirely for maximum speed on common system tools.
const knownAliases: Record<string, Omit<ResolveResult, 'found'>> = {
  'notepad':          { targetType: 'executable', displayName: 'Notepad',          validatedTarget: 'notepad.exe',    source: 'alias' },
  'calculator':       { targetType: 'uri',        displayName: 'Calculator',       validatedTarget: 'calculator:',    source: 'alias' },
  'calc':             { targetType: 'uri',        displayName: 'Calculator',       validatedTarget: 'calculator:',    source: 'alias' },
  'paint':            { targetType: 'executable', displayName: 'Paint',            validatedTarget: 'mspaint.exe',    source: 'alias' },
  'file explorer':    { targetType: 'executable', displayName: 'File Explorer',    validatedTarget: 'explorer.exe',   source: 'alias' },
  'explorer':         { targetType: 'executable', displayName: 'File Explorer',    validatedTarget: 'explorer.exe',   source: 'alias' },
  'settings':         { targetType: 'uri',        displayName: 'Settings',         validatedTarget: 'ms-settings:',   source: 'alias' },
  'task manager':     { targetType: 'executable', displayName: 'Task Manager',     validatedTarget: 'taskmgr.exe',    source: 'alias' },
  'powershell':       { targetType: 'executable', displayName: 'PowerShell',       validatedTarget: 'powershell.exe', source: 'alias' },
  'command prompt':   { targetType: 'executable', displayName: 'Command Prompt',   validatedTarget: 'cmd.exe',        source: 'alias' },
  'cmd':              { targetType: 'executable', displayName: 'Command Prompt',   validatedTarget: 'cmd.exe',        source: 'alias' },
};

// ─── Name Normalization Map ───────────────────────────────────────
// Maps common informal names to what Get-StartApps lists them as.
const nameNormalization: Record<string, string> = {
  'vs code':             'visual studio code',
  'vscode':              'visual studio code',
  'code':                'visual studio code',
  'chrome':              'google chrome',
  'edge':                'microsoft edge',
  'word':                'word',
  'excel':               'excel',
  'powerpoint':          'powerpoint',
  'outlook':             'outlook',
  'teams':               'microsoft teams',
  'onenote':             'onenote',
  'store':               'microsoft store',
  'snip':                'snipping tool',
  'snipping tool':       'snipping tool',
  'photos':              'photos',
  'clock':               'clock',
  'maps':                'maps',
  'mail':                'mail',
  'calendar':            'calendar',
  'camera':              'camera',
  'recorder':            'sound recorder',
  'sticky notes':        'sticky notes',
  'whiteboard':          'whiteboard',
  'weather':             'weather',
  'xbox':                'xbox',
};

// ─── Windows App Discovery ────────────────────────────────────────
interface WindowsApp {
  Name: string;
  AppID: string;
}

let cachedApps: WindowsApp[] | null = null;
let cachePromise: Promise<WindowsApp[]> | null = null;

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/['"]/g, '');
}

/**
 * Fetches ALL installed Windows applications (UWP + Win32 + Start Menu)
 * using the native PowerShell Get-StartApps cmdlet via a static .ps1 file.
 * Results are cached in-process after the first call.
 */
async function getWindowsApps(): Promise<WindowsApp[]> {
  if (cachedApps) return cachedApps;
  // Prevent duplicate concurrent invocations during startup
  if (cachePromise) return cachePromise;

  cachePromise = new Promise<WindowsApp[]>(async (resolvePromise) => {
    const timeout = setTimeout(() => resolvePromise([]), 8000); // safety timeout
    try {
      const ps1Path = join(tmpdir(), 'vayris_get_apps.ps1');
      await fs.writeFile(ps1Path, 'Get-StartApps | ConvertTo-Json -Depth 1 -Compress');

      const child = spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1Path
      ]);

      let out = '';
      child.stdout.on('data', (d: Buffer) => { out += d.toString(); });

      child.on('close', () => {
        clearTimeout(timeout);
        try {
          const apps = JSON.parse(out);
          cachedApps = Array.isArray(apps) ? apps : [];
          console.log(`[APP_RESOLVER] Indexed ${cachedApps.length} installed Windows applications`);
          resolvePromise(cachedApps);
        } catch {
          resolvePromise([]);
        }
      });
      child.on('error', () => { clearTimeout(timeout); resolvePromise([]); });
    } catch {
      clearTimeout(timeout);
      resolvePromise([]);
    }
  });

  return cachePromise;
}

/**
 * Warm up the app cache at startup so the first "open X" command doesn't wait.
 */
export function warmUpAppCache(): void {
  getWindowsApps().catch(() => {});
}

// ─── Application Resolver ─────────────────────────────────────────
export class ApplicationResolver {
  async resolve(appName: string): Promise<ResolveResult> {
    const normalized = normalizeName(appName);

    // Phase 1: Known aliases (instant, 0ms)
    if (knownAliases[normalized]) {
      return { found: true, ...knownAliases[normalized] };
    }

    // Phase 2: Discover via Windows Get-StartApps (AUMID resolution)
    const apps = await getWindowsApps();
    const searchName = nameNormalization[normalized] || normalized;

    // 2a. Exact name match (case-insensitive)
    let matchedApp = apps.find(a => a.Name.toLowerCase() === searchName);

    // 2b. Starts-with match (e.g., "discord" matches "Discord")
    if (!matchedApp) {
      matchedApp = apps.find(a => a.Name.toLowerCase().startsWith(searchName));
    }

    // 2c. Substring match (e.g., "spotify" matches "Spotify Music")
    if (!matchedApp) {
      matchedApp = apps.find(a => a.Name.toLowerCase().includes(searchName));
    }

    // 2d. Reverse substring (user says full name but app has shorter name)
    if (!matchedApp) {
      matchedApp = apps.find(a => searchName.includes(a.Name.toLowerCase()));
    }

    if (matchedApp) {
      return {
        found: true,
        targetType: 'uri',
        displayName: matchedApp.Name,
        source: 'StartApps',
        validatedTarget: `shell:AppsFolder\\${matchedApp.AppID}`
      };
    }

    // Phase 3: Removed arbitrary PATH fallback per requirements.

    return {
      found: false,
      targetType: 'executable',
      displayName: appName,
      source: 'unknown',
      validatedTarget: ''
    };
  }
}

// ─── Application Launcher ─────────────────────────────────────────
export class ApplicationLauncher {
  async launch(app: ResolveResult): Promise<void> {
    if (!app.found) throw new Error(`Cannot launch unresolved application: ${app.displayName}`);
    console.log(`[APP_LAUNCHER] Launching: ${app.displayName} (${app.targetType}) via ${app.source} → ${app.validatedTarget}`);

    return new Promise((resolve, reject) => {
      let child;
      try {
        if (app.targetType === 'uri' || app.targetType === 'shortcut') {
          // explorer.exe natively handles shell:AppsFolder\AUMID, URIs, and .lnk files
          child = spawn('explorer.exe', [app.validatedTarget], {
            detached: true,
            stdio: 'ignore',
            windowsHide: false
          });
        } else if (app.targetType === 'executable') {
          // Direct process spawn (no shell: true)
          child = spawn(app.validatedTarget, [], {
            detached: true,
            stdio: 'ignore',
            windowsHide: false
          });
        }

        if (child) {
          child.unref();
          child.on('error', (err) => reject(err));
          // Detached processes are considered launched once they spawn without error
          setTimeout(resolve, 150);
        } else {
          reject(new Error('Unknown target type'));
        }
      } catch (err) {
        reject(err);
      }
    });
  }
}
