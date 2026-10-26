import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FinderError } from './contracts.js';

// Official 0.2.1-rc.2 seam: ctx.workspaceRegistry.get(id) -> Workspace.path.
// See dsh-workspace src/index.ts:282 and src/types.ts:69-82. No profile or
// process-cwd fallback is permitted when that optional service is unavailable.
export const OPPORTUNITY_CONTEXT_LIMITS = Object.freeze({ maxFiles: 8, maxFileBytes: 32768, maxTotalBytes: 98304, maxEntries: 100 });
const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.rst', '.csv', '.tsv', '.json', '.yaml', '.yml', '.js', '.jsx', '.ts', '.tsx', '.py', '.sql', '.html', '.css']);
const BLOCKED_PARTS = new Set(['node_modules', 'vendor', 'dist', 'build', 'credentials', 'secrets']);
const CREDENTIAL_NAME = /(?:^|[._-])(?:credentials?|secrets?|tokens?|passwords?|passwd|id_rsa|id_ed25519|private[_-]?keys?)(?:[._-]|$)/iu;
const PRIVATE_EXTENSION = /\.(?:pem|key|p12|pfx|keystore|jks|sqlite|sqlite3|db|db3)$/iu;
const SECRET_CONTENT = /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b|\bBearer\s+[A-Za-z0-9._~-]{20,}|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd)\b\s*["']?\s*[:=]\s*["'][^"'\r\n]{8,}["']/iu;
const UNQUOTED_SECRET = /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd)\b\s*[:=]\s*(?!(?:process\.env\.|import\.meta\.env\.|YOUR_|REDACTED\b|PLACEHOLDER\b|EXAMPLE\b))[A-Za-z0-9_./+~=\-]{8,}/iu;
const inside = (root, candidate) => { const relative = path.relative(root, candidate); return relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };
const sameFile = (left, right) => left.dev === right.dev && left.ino === right.ino;
const reject = code => { throw new FinderError(code); };
const aborted = signals => { if (signals.some(signal => signal?.aborted)) reject('MODEL_ABORTED'); };

function safeRelative(value, { directory = false } = {}) {
  if (directory && value === '') return '';
  if (typeof value !== 'string' || !value || value.length > 1000 || value !== value.trim() || /[\u0000-\u001f\u007f\\:]/u.test(value) || path.isAbsolute(value)) reject('CONTEXT_FILE_BLOCKED');
  const segments = value.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.startsWith('.') || BLOCKED_PARTS.has(segment.toLowerCase()) || CREDENTIAL_NAME.test(segment) || PRIVATE_EXTENSION.test(segment))) reject('CONTEXT_FILE_BLOCKED');
  if (!directory && !TEXT_EXTENSIONS.has(path.extname(value).toLowerCase()) && !/^(?:README|LICENSE)$/u.test(path.basename(value))) reject('CONTEXT_FILE_BLOCKED');
  return segments.join('/');
}

function safeArguments(input, names) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !names.includes(key))) reject('CONTEXT_FILE_BLOCKED');
  if (typeof input.workspaceId !== 'string' || !input.workspaceId.trim() || input.workspaceId.length > 200 || /[\u0000-\u001f\u007f]/u.test(input.workspaceId)) reject('CONTEXT_UNAVAILABLE');
  return input;
}

function limitsFrom(options) {
  return Object.freeze(Object.fromEntries(Object.entries(OPPORTUNITY_CONTEXT_LIMITS).map(([key, max]) => [key, Number.isSafeInteger(options[key]) && options[key] > 0 ? Math.min(options[key], max) : max])));
}

/**
 * Read only explicitly selected text files from a registered Host workspace.
 * The caller owns user-action/grant gating. Metadata never reads file content;
 * discovery must not call this reader until the corresponding grant is valid.
 */
export function createOpportunityContextReader(ctx, options = {}) {
  const limits = limitsFrom(options), lifetime = options.signal;
  const registry = () => { try { return ctx.get('workspaceRegistry', false); } catch { return undefined; } };

  async function workspace(workspaceId, signal) {
    const signals = [signal, lifetime]; aborted(signals);
    let entity;
    try { entity = registry()?.get?.(workspaceId); } catch { reject('CONTEXT_UNAVAILABLE'); }
    if (!entity || entity.id !== workspaceId || typeof entity.path !== 'string' || !path.isAbsolute(entity.path)) reject('CONTEXT_UNAVAILABLE');
    const root = path.resolve(entity.path);
    let canonical, stat;
    try { canonical = await fs.realpath(root); stat = await fs.lstat(root); } catch { reject('CONTEXT_UNAVAILABLE'); }
    aborted(signals);
    if (canonical !== root || stat.isSymbolicLink() || !stat.isDirectory()) reject('CONTEXT_UNAVAILABLE');
    return { workspaceId, title: typeof entity.title === 'string' ? entity.title.slice(0, 300) : '当前工作区', root, stat, signals };
  }

  async function confirmWorkspace(context) {
    aborted(context.signals);
    let entity, stat;
    try { entity = registry()?.get?.(context.workspaceId); stat = await fs.lstat(context.root); } catch { reject('CONTEXT_UNAVAILABLE'); }
    if (!entity || entity.id !== context.workspaceId || entity.path !== context.root || !stat.isDirectory() || stat.isSymbolicLink() || !sameFile(context.stat, stat)) reject('CONTEXT_UNAVAILABLE');
    aborted(context.signals);
  }

  async function walk(context, relative, { directory = false } = {}) {
    aborted(context.signals);
    const segments = relative ? relative.split('/') : [], parents = [];
    let current = context.root;
    for (let index = 0; index < segments.length; index += 1) {
      current = path.join(current, segments[index]);
      if (!inside(context.root, current)) reject('CONTEXT_FILE_BLOCKED');
      let stat; try { stat = await fs.lstat(current); } catch { reject('CONTEXT_FILE_BLOCKED'); }
      aborted(context.signals);
      const needsDirectory = directory || index < segments.length - 1;
      if (stat.isSymbolicLink() || needsDirectory && !stat.isDirectory() || !needsDirectory && !stat.isFile()) reject('CONTEXT_FILE_BLOCKED');
      if (needsDirectory) parents.push({ file: current, stat });
      else return { file: current, stat, parents };
    }
    return { file: current, stat: parents.at(-1)?.stat || context.stat, parents };
  }

  async function confirmParents(context, parents) {
    await confirmWorkspace(context);
    for (const parent of parents) {
      let now; try { now = await fs.lstat(parent.file); } catch { reject('CONTEXT_FILE_BLOCKED'); }
      if (now.isSymbolicLink() || !now.isDirectory() || !sameFile(parent.stat, now)) reject('CONTEXT_FILE_BLOCKED');
      aborted(context.signals);
    }
  }

  const readWorkspaceContext = async (input = {}) => {
    const { workspaceId, paths, signal } = safeArguments(input, ['workspaceId', 'paths', 'signal']);
    if (!Array.isArray(paths) || paths.length < 1 || paths.length > limits.maxFiles) reject('CONTEXT_LIMIT');
    const selected = paths.map(value => safeRelative(value));
    if (new Set(selected).size !== selected.length) reject('CONTEXT_FILE_BLOCKED');
    const context = await workspace(workspaceId, signal), items = [];
    let totalBytes = 0;
    for (const relative of selected) {
      const target = await walk(context, relative);
      if (target.stat.nlink !== 1) reject('CONTEXT_FILE_BLOCKED');
      if (target.stat.size > limits.maxFileBytes || totalBytes + target.stat.size > limits.maxTotalBytes) reject('CONTEXT_LIMIT');
      let handle;
      try {
        handle = await fs.open(target.file, constants.O_RDONLY | constants.O_NOFOLLOW);
        const opened = await handle.stat();
        if (!opened.isFile() || opened.nlink !== 1 || !sameFile(target.stat, opened)) reject('CONTEXT_FILE_BLOCKED');
        await confirmParents(context, target.parents);
        aborted(context.signals);
        const data = Buffer.alloc(limits.maxFileBytes + 1);
        let length = 0;
        while (length < data.length) {
          const result = await handle.read(data, length, data.length - length, length);
          aborted(context.signals);
          if (!result.bytesRead) break;
          length += result.bytesRead;
        }
        if (length > limits.maxFileBytes || totalBytes + length > limits.maxTotalBytes) reject('CONTEXT_LIMIT');
        const after = await handle.stat(), current = await fs.lstat(target.file);
        if (!sameFile(opened, current) || current.isSymbolicLink() || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs || length !== opened.size) reject('CONTEXT_FILE_BLOCKED');
        await confirmParents(context, target.parents);
        const bytes = data.subarray(0, length);
        let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { reject('CONTEXT_FILE_BLOCKED'); }
        if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text) || SECRET_CONTENT.test(text) || UNQUOTED_SECRET.test(text)) reject('CONTEXT_FILE_BLOCKED');
        totalBytes += length;
        items.push({ id: `workspace:${workspaceId}:${encodeURIComponent(relative)}`, title: relative, text, source: { workspaceId, path: relative, sha256: createHash('sha256').update(bytes).digest('hex') } });
      } catch (error) {
        if (error instanceof FinderError) throw error;
        reject('CONTEXT_FILE_BLOCKED');
      } finally { if (handle) await handle.close().catch(() => {}); }
    }
    await confirmWorkspace(context);
    return { workspaceId, workspaceTitle: context.title, items, totalBytes, limits };
  };

  readWorkspaceContext.metadata = async (input = {}) => {
    const { workspaceId, path: directoryPath = '', signal } = safeArguments(input, ['workspaceId', 'path', 'signal']);
    const relative = safeRelative(directoryPath, { directory: true }), context = await workspace(workspaceId, signal);
    const directory = await walk(context, relative, { directory: true });
    const files = []; let truncated = false, directoryHandle, scanned = 0;
    try {
      directoryHandle = await fs.opendir(directory.file);
      for await (const entry of directoryHandle) {
        aborted(context.signals);
        if (scanned++ >= limits.maxEntries * 10) { truncated = true; break; }
        if (!entry.isFile() || entry.isSymbolicLink()) continue;
        const candidate = relative ? relative + '/' + entry.name : entry.name;
        try { safeRelative(candidate); } catch { continue; }
        const stat = await fs.lstat(path.join(directory.file, entry.name));
        if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 || stat.size > limits.maxFileBytes) continue;
        if (files.length >= limits.maxEntries) { truncated = true; break; }
        files.push({ path: candidate, name: entry.name, size: stat.size });
      }
    } catch (error) {
      if (error instanceof FinderError) throw error;
      reject('CONTEXT_UNAVAILABLE');
    } finally { if (directoryHandle) await directoryHandle.close().catch(() => {}); }
    await confirmParents(context, directory.parents);
    files.sort((left, right) => left.path.localeCompare(right.path));
    return { workspaceId, title: context.title, files, truncated };
  };

  readWorkspaceContext.validateWorkspace = async (input = {}) => {
    const { workspaceId, signal } = safeArguments(input, ['workspaceId', 'signal']);
    const context = await workspace(workspaceId, signal);
    await confirmWorkspace(context);
    return { workspaceId, title: context.title };
  };
  readWorkspaceContext.limits = limits;
  return readWorkspaceContext;
}
