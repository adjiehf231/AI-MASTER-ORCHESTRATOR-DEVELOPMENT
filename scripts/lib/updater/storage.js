const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_METADATA_BYTES = 256 * 1024;
const RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function within(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`));
}
function validateRelative(relative) {
  if (typeof relative !== 'string' || !relative || relative.length > 2048 || relative.includes('\\') || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative)) throw new Error('Expected a portable relative path');
  const parts = relative.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /[\x00-\x1f\x7f:<>"|?*]/.test(p) || /[. ]$/.test(p) || RESERVED.test(p))) throw new Error('Unsafe or ambiguous relative path');
  return parts;
}
function regularRoot(input) {
  if (typeof input !== 'string' || !input) throw new Error('An explicit directory is required');
  const target = path.resolve(input);
  if (process.platform === 'win32' && /^\\\\/.test(target)) throw new Error('Network filesystems are unsupported');
  let current = path.parse(target).root;
  for (const part of target.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Linked or unsupported directory ancestor');
  }
  return fs.realpathSync.native(target);
}
function inspectTarget(workspace, relative) {
  const root = regularRoot(workspace);
  const parts = validateRelative(relative);
  let target = root;
  for (let i = 0; i < parts.length; i++) {
    target = path.join(target, parts[i]);
    let stat;
    try { stat = fs.lstatSync(target); } catch (error) { if (error.code === 'ENOENT') return { root, target: path.join(root, ...parts), stat: null }; throw error; }
    if (stat.isSymbolicLink() || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) throw new Error('Linked or unsupported target');
    if (i === parts.length - 1 && (stat.nlink !== 1 || stat.size > MAX_FILE_BYTES)) throw new Error('Hardlinked or oversized target');
    if (process.platform === 'win32') {
      const found = fs.readdirSync(path.dirname(target)).filter(n => n.toLowerCase() === parts[i].toLowerCase());
      if (found.length !== 1 || found[0] !== parts[i]) throw new Error('Case-ambiguous target spelling');
    }
  }
  return { root, target, stat: fs.lstatSync(target) };
}
function environment(extra = {}) {
  const env = {};
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) if (process.env[key] !== undefined) env[key] = process.env[key];
  return { ...env, ...extra };
}
function fixedTool(program, args, extra = {}, limit = MAX_METADATA_BYTES) {
  const timeout = 15_000;
  const result = spawnSync(program, args, { env: environment(extra), encoding: 'utf8', timeout, maxBuffer: limit, windowsHide: true });
  const failure = 'Required native metadata capability failed or is unavailable';
  // Child output and spawn errors can contain paths, ACLs, or other private data.
  if (result.error?.code === 'ETIMEDOUT') throw new Error(`${failure} (${path.basename(program)} timed out after ${timeout} ms)`);
  if (result.error?.code === 'ENOENT') throw new Error(`${failure} (${path.basename(program)} executable missing)`);
  if (result.error || result.status !== 0) throw new Error(failure);
  try { return JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim()); } catch { throw new Error('Invalid native metadata response'); }
}
function powershell(script, env = {}, limit) {
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const modules = path.join(path.dirname(executable), 'Modules');
  // Windows PowerShell can rebuild its module search path at startup. Restrict
  // lookup again in the child before any cmdlet can load a user or shared module.
  const prefix = '$ErrorActionPreference="Stop";'
    + '$env:PSModulePath=[IO.Path]::Combine($PSHOME,"Modules");'
    + '[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);';
  return fixedTool(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(prefix + script, 'utf16le').toString('base64')],
    { ...env, PSModulePath: modules }, limit);
}
const PY_METADATA = 'import os,sys,json,base64\np=os.environ["ORCH_TARGET"]\ns=os.stat(p,follow_symlinks=False)\nx={n:base64.b64encode(os.getxattr(p,n,follow_symlinks=False)).decode("ascii") for n in sorted(os.listxattr(p,follow_symlinks=False))}\nprint(json.dumps({"platform":"posix","uid":s.st_uid,"gid":s.st_gid,"mode":s.st_mode&4095,"flags":getattr(s,"st_flags",0),"xattrs":x},sort_keys=True))';
function nativeMetadata(target) {
  let value;
  if (process.platform === 'win32') {
    // Archive and timestamps change as a consequence of writing bytes. They are
    // outside the permission/custom-metadata contract; all other attributes bind.
    value = powershell("$p=$env:ORCH_TARGET;$f=Get-Item -LiteralPath $p -Force;$streams=@(Get-Item -LiteralPath $p -Stream * | Where-Object {$_.Stream -ne ':$DATA'});if($streams.Count -gt 0){throw 'Alternate streams unsupported'};if(([int]$f.Attributes -band 0x4E00)-ne 0){throw 'Unsupported file attributes'};$a=Get-Acl -LiteralPath $p;@{platform='win32';sddl=$a.Sddl;attributes=([int]$f.Attributes -band (-bnot 32))}|ConvertTo-Json -Compress", { ORCH_TARGET: target });
  } else if (process.platform === 'linux' || process.platform === 'darwin') {
    value = fixedTool('python3', ['-I', '-c', PY_METADATA], { ORCH_TARGET: target });
    if (value.flags !== 0 || (value.mode & 0o7000) || Object.hasOwn(value.xattrs, 'security.capability')) throw new Error('Special file permissions, capabilities or flags are unsupported');
  } else throw new Error('Unsupported metadata platform');
  if (Buffer.byteLength(canonical(value)) > MAX_METADATA_BYTES / 2) throw new Error('Native metadata exceeds the supported bound');
  return value;
}
function snapshotFile(workspace, relative) {
  const { target, stat } = inspectTarget(workspace, relative);
  if (!stat) return { exists: false, type: 'absent' };
  const bytes = fs.readFileSync(target);
  const metadata = nativeMetadata(target);
  const after = fs.lstatSync(target);
  if (stat.dev !== after.dev || stat.ino !== after.ino || stat.size !== after.size || stat.mtimeMs !== after.mtimeMs || stat.mode !== after.mode) throw new Error('Target changed during snapshot');
  return { exists: true, type: 'file', sha256: sha256(bytes), mode: stat.mode & 0o777, metadata };
}
function sameState(a, b) { return canonical(a) === canonical(b); }
function fsyncDirectory(directory) {
  let fd;
  try { fd = fs.openSync(directory, 'r'); fs.fsyncSync(fd); }
  catch (error) { if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EINVAL', 'EISDIR'].includes(error.code)) throw error; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
function writeDurable(file, bytes, exclusive = false) {
  const fd = fs.openSync(file, exclusive ? 'wx' : 'w', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fsyncDirectory(path.dirname(file));
}
function writeJson(file, value) {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  writeDurable(temp, Buffer.from(`${canonical(value)}\n`), true);
  fs.renameSync(temp, file);
  fsyncDirectory(path.dirname(file));
}
function readJson(file, maxBytes = 64 * 1024 * 1024) {
  regularRoot(path.dirname(file));
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > maxBytes) throw new Error('Unsafe or oversized private metadata');
  const text = fs.readFileSync(file, 'utf8');
  // Native parser messages can quote input containing private context or backups.
  try { return JSON.parse(text); } catch { throw new Error('Invalid private metadata JSON'); }
}
function privateDirectory(directory, create) {
  if (process.platform === 'win32') return privateWindowsDirectories([directory], create);
  let fresh = false;
  if (create) {
    try { fs.mkdirSync(directory, { mode: 0o700 }); fresh = true; } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Private store must be a regular directory');
  if (typeof process.getuid !== 'function' || stat.uid !== process.getuid() || (stat.mode & 0o077)) throw new Error('Private store requires current-user ownership and mode 0700');
  return fresh;
}
function privateWindowsDirectories(directories, create) {
  const encoded = JSON.stringify(directories);
  if (directories.length > 64 || encoded.length > 16000) throw new Error('Private directory request exceeds its supported bound');
  // One fixed process checks each parent before it creates/checks the next child.
  // No ACL decision is cached between operations or across possible user edits.
  return powershell('$paths=ConvertFrom-Json $env:ORCH_PRIVATE_PATHS;$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;$sys=[System.Security.Principal.SecurityIdentifier]::new("S-1-5-18");foreach($p in $paths){$fresh=$false;if(-not [System.IO.Directory]::Exists($p)){if($env:ORCH_CREATE -ne "1"){throw "Private directory missing"};[System.IO.Directory]::CreateDirectory($p)|Out-Null;$fresh=$true};$f=Get-Item -LiteralPath $p -Force;if(-not $f.PSIsContainer -or ([int]$f.Attributes -band 1024)-ne 0){throw "Unsupported private directory"};if($fresh){$acl=[System.Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false);foreach($s in @($sid,$sys)){$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($s,"FullControl","ContainerInherit,ObjectInherit","None","Allow"))};Set-Acl -LiteralPath $p -AclObject $acl};$a=Get-Acl -LiteralPath $p;if(-not $a.AreAccessRulesProtected -or $a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){throw "Unsafe private owner"};foreach($r in $a.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])){if($r.AccessControlType -ne "Allow" -or $r.IdentityReference.Value -notin @($sid.Value,$sys.Value)){throw "Unsafe private permissions"}}};@{private=$true}|ConvertTo-Json -Compress', { ORCH_PRIVATE_PATHS: encoded, ORCH_CREATE: create ? '1' : '0' });
}
function assertPrivateStore(store, { workspace, sourceRoot, create = true } = {}) {
  if (typeof store !== 'string' || !path.isAbsolute(store)) throw new Error('An absolute private store path is required');
  const target = path.resolve(store);
  const parent = regularRoot(path.dirname(target));
  // The final component can itself be an 8.3/case alias of an existing root.
  // Resolve it before overlap checks, rather than only canonicalizing its parent.
  const resolved = fs.existsSync(target) ? regularRoot(target) : path.join(parent, path.basename(target));
  for (const forbidden of [workspace, sourceRoot, path.resolve(__dirname, '..', '..', '..')].filter(Boolean)) {
    const root = regularRoot(forbidden);
    if (within(root, resolved) || within(resolved, root)) throw new Error('Private store must be separate from the workspace and updater source');
  }
  if (!create && !fs.existsSync(resolved)) throw new Error('Private store does not exist');
  privateDirectory(resolved, create);
  return regularRoot(resolved);
}
function privateSubdirectory(store, relative) {
  const parts = validateRelative(relative);
  let current = regularRoot(store);
  if (process.platform === 'win32') {
    const directories = [current, ...parts.map(part => (current = path.join(current, part)))];
    privateWindowsDirectories(directories, true);
  } else {
    privateDirectory(current, false);
    for (const part of parts) { current = path.join(current, part); privateDirectory(current, true); }
  }
  return regularRoot(current);
}
function installationId(workspace, installPath) {
  validateRelative(installPath);
  const root = regularRoot(workspace);
  return sha256(`${process.platform === 'win32' ? root.toLowerCase() : root}\0${installPath}`);
}
function readInstallation({ store, workspace, installPath }) {
  const root = assertPrivateStore(store, { workspace, create: false });
  const directory = path.join(root, 'installations', installationId(workspace, installPath));
  const file = path.join(directory, 'installed.json');
  if (!fs.existsSync(file)) return null;
  regularRoot(directory);
  return readJson(file, 4 * 1024 * 1024);
}
function processIdentity(pid = process.pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Invalid lock process');
  if (process.platform === 'win32') return powershell('$p=Get-Process -Id ([int]$env:ORCH_PID) -ErrorAction SilentlyContinue;if($null -eq $p){@{alive=$false}|ConvertTo-Json -Compress}else{@{alive=$true;start=$p.StartTime.ToUniversalTime().Ticks.ToString()}|ConvertTo-Json -Compress}', { ORCH_PID: String(pid) });
  if (process.platform === 'linux') {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const boot = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
      return { alive: true, start: `${boot}:${stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]}` };
    }
    catch (error) { if (error.code === 'ENOENT') return { alive: false }; throw error; }
  }
  throw new Error('Reliable lock process identity is unavailable on this platform');
}

function assertSupportedFilesystem(input) {
  const root = regularRoot(input);
  if (process.platform === 'win32') {
    const result = powershell('$d=[System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($env:ORCH_TARGET));@{local=([int]$d.DriveType -eq 3);format=$d.DriveFormat}|ConvertTo-Json -Compress', { ORCH_TARGET: root });
    if (!result.local || result.format !== 'NTFS') throw new Error('Apply supports local NTFS filesystems only on Windows');
    return { platform: 'win32', filesystem: result.format };
  }
  if (process.platform === 'linux') {
    const decode = value => value.replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
    const entries = fs.readFileSync('/proc/self/mountinfo', 'utf8').trim().split('\n').map(line => {
      const parts = line.split(' '); const separator = parts.indexOf('-');
      return { mount: decode(parts[4]), filesystem: parts[separator + 1] };
    }).filter(entry => within(entry.mount, root)).sort((a, b) => b.mount.length - a.mount.length);
    const type = entries[0]?.filesystem;
    if (!['ext4', 'xfs', 'btrfs', 'tmpfs', 'overlay'].includes(type)) throw new Error('Apply requires a supported local Linux filesystem');
    return { platform: 'linux', filesystem: type };
  }
  throw new Error('Apply filesystem/process-identity support is unavailable on this platform');
}

module.exports = { MAX_FILE_BYTES, MAX_METADATA_BYTES, sha256, canonical, within, validateRelative, regularRoot, inspectTarget, nativeMetadata, snapshotFile, sameState, fsyncDirectory, writeDurable, writeJson, readJson, assertPrivateStore, privateSubdirectory, installationId, readInstallation, processIdentity, assertSupportedFilesystem };
