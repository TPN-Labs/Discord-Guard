// Unless explicitly defined, set NODE_ENV as development:
process.env.NODE_ENV ??= 'development';

import 'reflect-metadata';
import '@sapphire/plugin-logger/register';
import '@sapphire/plugin-api/register';
import '@sapphire/plugin-editable-commands/register';
import * as colorette from 'colorette';
import { config } from 'dotenv';
import { expand } from 'dotenv-expand';
import { existsSync } from 'fs';
import { join } from 'path';
import { inspect } from 'util';
import { srcDir } from './constants';

// Read env vars, Create React App style. Files are listed highest priority first:
// dotenv keeps the first value it sees for a key and never overrides variables
// already set in process.env. `.env.local` is skipped in tests so they stay reproducible.
const base = join(srcDir, '.env');
const env = process.env.NODE_ENV;
const envFiles = [`${base}.${env}.local`, env !== 'test' && `${base}.local`, `${base}.${env}`, base].filter(
	(file): file is string => typeof file === 'string' && existsSync(file)
);

if (envFiles.length > 0) {
	expand(config({ path: envFiles, quiet: true }));
}

// Set default inspection depth
inspect.defaultOptions.depth = 1;

// Enable colorette
colorette.createColors({ useColor: true });
