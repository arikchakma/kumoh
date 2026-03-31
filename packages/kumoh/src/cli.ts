#!/usr/bin/env node

import { defineCommand, runMain } from 'citty';

import { db } from './cli/db.js';
import { deploy } from './cli/deploy.js';
import { destroy } from './cli/destroy.js';
import { init } from './cli/init.js';
import { status } from './cli/status.js';

const main = defineCommand({
  meta: { name: 'kumoh', version: '0.1.0', description: 'The Kumoh CLI' },
  subCommands: { init, db, deploy, status, destroy },
});

void runMain(main);
