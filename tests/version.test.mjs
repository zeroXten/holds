// The version must be the same everywhere it appears.
// Run: node tests/version.test.mjs
import { readFileSync } from 'node:fs';
import { VERSION } from '../js/version.js';

const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8').match(/const VERSION = '([^']+)'/)?.[1];
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const semver = /^\d+\.\d+\.\d+$/.test(VERSION);
const ok = semver && sw === VERSION && pkg === VERSION;
console.log(`${ok ? 'ok  ' : 'FAIL'} version: js/version.js ${VERSION}, sw.js ${sw}, package.json ${pkg}`);
console.log(ok ? 'all passed' : '1 failure(s)');
process.exit(ok ? 0 : 1);
