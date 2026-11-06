// Unless explicitly defined, set NODE_ENV as development:
process.env.NODE_ENV ??= 'development';

import 'reflect-metadata';
import '@sapphire/plugin-logger/register';
import '@sapphire/plugin-api/register';
import '@sapphire/plugin-editable-commands/register';
import * as colorette from 'colorette';
import { config, type DotenvCraOptions } from 'dotenv-cra';
import { join } from 'path';
import { inspect } from 'util';
import { srcDir } from './constants';

// dotenv-cra's options extend dotenv@10's `DotenvConfigOptions`, which TypeScript cannot resolve under
// `moduleResolution: Node16` (dotenv@10's `exports` map has no `types` entry), so `path` is lost from the
// type. dotenv-cra still reads `options.path` at runtime, so declare it explicitly here.
const dotenvOptions: DotenvCraOptions & { path: string } = { path: join(srcDir, '.env') };

// Read env var
config(dotenvOptions);

// Set default inspection depth
inspect.defaultOptions.depth = 1;

// Enable colorette
colorette.createColors({ useColor: true });
