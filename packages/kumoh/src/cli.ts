#!/usr/bin/env node

import { defineCommand, runMain } from 'citty';

import { db } from './cli/db.ts';
import { deploy } from './cli/deploy.ts';
import { destroy } from './cli/destroy.ts';
import { doCmd } from './cli/do.ts';
import { init } from './cli/init.ts';
import { setup } from './cli/setup.ts';
import { status } from './cli/status.ts';

const main = defineCommand({
  meta: { name: 'kumoh', version: '0.1.0', description: 'The Kumoh CLI' },
  subCommands: { init, db, do: doCmd, deploy, status, destroy, setup },
});

void runMain(main);
