#!/usr/bin/env node
const { createHash, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { componentPath, saveComponent } = require('./lib/component-store');
const { formatFrontmatter, parseFrontmatter, validateComponent } = require('./lib/frontmatter');

const repoRoot = path.resolve(__dirname, '..');
const maxBytes = 1024 * 1024;
const maxRedirects = 4;
const timeoutMs = 15_000;
const replacements = [
  [/\b(Acme|Contoso|FooCorp|MyCompany|Karirly)\b/gi, '${PROJECT_NAME}'],
  [/\bacme_(dev|prod|uat|test)\b/gi, '${DB_NAME}_$1'],
  [/https?:\/\/[a-z0-9.-]+\.(?:acme|example)\.com/gi, 'https://${PROJECT_DOMAIN}']
];

function sanitizeContent(markdown) {
  return replacements.reduce((content, [pattern, replacement]) => (
    content.replace(pattern, replacement)
  ), markdown);
}

function remoteUrl(input, base) {
  let address;
  try {
    address = new URL(input, base);
  } catch {
    throw new Error('Expected a valid HTTPS URL.');
  }
  if (address.protocol !== 'https:' || address.username || address.password) {
    throw new Error('Remote imports require HTTPS without URL credentials.');
  }
  return address;
}

async function fetchMarkdown(url) {
  let address = remoteUrl(url);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    const response = await fetch(address, { signal, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location || redirects === maxRedirects) throw new Error('Remote import exceeded its HTTPS redirect limit.');
      address = remoteUrl(location, address);
      continue;
    }
    if (!response.ok || !response.body || Number(response.headers.get('content-length')) > maxBytes) {
      await response.body?.cancel();
      throw new Error(response.ok ? 'Remote import is empty or exceeds 1 MiB.' : `Remote import failed (HTTP ${response.status}).`);
    }

    const chunks = [];
    let size = 0;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error('Remote import exceeds 1 MiB.');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return { bytes: Buffer.concat(chunks), source: `${address.origin}${address.pathname}` };
  }
}

function readLocalMarkdown(filename) {
  const source = path.resolve(filename);
  const stats = fs.statSync(source);
  if (!stats.isFile() || stats.size > maxBytes) {
    throw new Error('Local import must be a regular file no larger than 1 MiB.');
  }
  const handle = fs.openSync(source, 'r');
  try {
    const bytes = Buffer.alloc(maxBytes + 1);
    let size = 0;
    while (size < bytes.length) {
      const length = fs.readSync(handle, bytes, size, bytes.length - size, null);
      if (length === 0) break;
      size += length;
    }
    if (size > maxBytes) throw new Error('Local import exceeds 1 MiB.');
    return { bytes: bytes.subarray(0, size), source };
  } finally {
    fs.closeSync(handle);
  }
}

function adaptMarkdown(content, name, kind, description, filename) {
  const hasFrontmatter = /^(?:\uFEFF)?---[ \t]*(?:\r?\n|$)/.test(content);
  const { attributes, body } = hasFrontmatter
    ? parseFrontmatter(content, filename)
    : { attributes: {}, body: content };
  if (!body.trim()) throw new Error('Imported Markdown body is empty.');
  const sourceDescription = description ?? attributes.description ?? `Enterprise ${name} capability for \${PROJECT_NAME}.`;
  if (typeof sourceDescription !== 'string' || !sourceDescription.trim()) {
    throw new Error('Imported description must be a nonempty string; use --desc to supply one.');
  }

  const metadata = { name, description: sanitizeContent(sourceDescription) };
  let markdown = sanitizeContent(body);
  if (kind === 'agent') {
    metadata.mode = attributes.mode ?? 'subagent';
    if (!/^#{1,6}\s+(?:\d+\.\s+)?Statutory Hard Gates\b/m.test(markdown)) {
      markdown = `${markdown.trimEnd()}\n\n## Statutory Hard Gates\n\n`
        + 'Follow the active project authorization, input validation, and release verification rules.\n';
    }
  }
  return formatFrontmatter(metadata, markdown);
}

function safeTerminalText(text) {
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '�');
}

function printHelp() {
  console.log(`Universal AI Master Orchestrator: Extension Importer CLI

Usage:
  node scripts/import-extension.js --type=agent|skill --name=<kebab-name> (--url=<https-url> | --file=<file>) [--desc="..."] [--apply] [--sha256=<digest>] [--force]

The default command previews the adapted Markdown and input SHA-256. Review it before adding it as an instruction.
Add --apply to save and synchronize repository adapters. Remote --apply requires the SHA-256 from a reviewed preview.
Use --force with --apply to replace an existing component. Antigravity deployment is a separate command.`);
}

async function main(args) {
  const { values } = parseArgs({
    args,
    options: {
      type: { type: 'string' },
      name: { type: 'string' },
      url: { type: 'string' },
      file: { type: 'string' },
      desc: { type: 'string' },
      sha256: { type: 'string' },
      apply: { type: 'boolean' },
      force: { type: 'boolean' },
      help: { type: 'boolean' }
    }
  });
  if (!args.length || values.help) {
    printHelp();
    return;
  }

  const { type, name, url, file, desc, apply, force, sha256 } = values;
  if (type !== 'agent' && type !== 'skill') throw new Error('Type must be "agent" or "skill".');
  const target = componentPath(type, name);
  if (Boolean(url) === Boolean(file)) throw new Error('Specify exactly one of --url or --file.');
  if (force && !apply) throw new Error('--force requires --apply.');
  if ((url && apply && !sha256) || (sha256 !== undefined && !/^[a-f0-9]{64}$/i.test(sha256))) {
    throw new Error('Provide the 64-character --sha256 digest from the reviewed preview.');
  }

  const { bytes, source } = url ? await fetchMarkdown(url) : readLocalMarkdown(file);
  const digest = createHash('sha256').update(bytes).digest();
  if (sha256 && !timingSafeEqual(digest, Buffer.from(sha256, 'hex'))) {
    throw new Error('Source SHA-256 does not match the reviewed file.');
  }
  const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const markdown = adaptMarkdown(content, name, type, desc, target);
  validateComponent(markdown, name, type, target);
  console.log(safeTerminalText(`Source: ${source}\nSHA-256: ${digest.toString('hex')}\nTarget: ${target}`));
  if (!apply) {
    console.log(`\n${safeTerminalText(markdown)}`);
    return;
  }

  saveComponent(repoRoot, type, name, { force }, () => markdown);
  console.log(`Imported ${target} and synchronized adapters.`);
}

main(process.argv.slice(2)).catch(error => {
  console.error(`Import failed: ${safeTerminalText(error.message)}`);
  process.exitCode = 1;
});

