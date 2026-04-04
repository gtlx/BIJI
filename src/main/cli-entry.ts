#!/usr/bin/env node

import { cli } from './cli.js';

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
Biji Note CLI

Usage: biji [command] [options]

Commands:
  new <title>              Create a new note
  list                     List all notes
  search <keyword>         Search notes by keyword
  show <id>                Show note content
  delete <id>              Delete a note (move to trash)
  restore <id>            Restore a note from trash
  folder                   List all folders
  sync                     Trigger sync
  start                    Start Biji Note desktop app
  status                   Show app status

Options:
  --help, -h               Show this help message
  --version, -v            Show version
  `.trim());
  process.exit(0);
}

if (args[0] === '--version' || args[0] === '-v') {
  console.log('Biji Note CLI v1.0.0');
  process.exit(0);
}

const command = args[0];
const options = args.slice(1);

cli(command, options).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
