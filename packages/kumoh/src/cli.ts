#!/usr/bin/env node

import { defineCommand, runMain } from 'citty';

import { db } from './cli/db.js';
import { deploy } from './cli/deploy.js';

const main = defineCommand({
  meta: { name: 'kumoh', version: '0.1.0', description: 'The Kumoh CLI' },
  subCommands: { db, deploy },
});

void runMain(main);
