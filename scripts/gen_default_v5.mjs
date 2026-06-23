// One-time script: convert app/data/default_layout.json from v4 to v5 format.
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { migrate } from '../app/js/migrations.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'app', 'data', 'default_layout.json');
const v4 = JSON.parse(readFileSync(path, 'utf8'));
const v5 = migrate(v4);
writeFileSync(path, JSON.stringify(v5, null, 2) + '\n', 'utf8');
console.log('Converted default_layout.json to schema version', v5.editor.schemaVersion);
console.log('Bins generated:', v5.bins.length);
