#!/usr/bin/env node

import { defineCommand, runMain } from 'citty';

import { db } from './cli/db.ts';
import { deploy } from './cli/deploy.ts';
import { destroy } from './cli/destroy.ts';
import { init } from './cli/init.ts';
import { status } from './cli/status.ts';

const main = defineCommand({
  meta: { name: 'kumoh', version: '0.1.0', description: 'The Kumoh CLI' },
  subCommands: { init, db, deploy, status, destroy },
});

void runMain(main);
