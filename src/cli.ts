#!/usr/bin/env node

import * as fs from 'fs';
import { promisify } from 'util';
import * as parser from '.';

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

const yargs = require('yargs');

async function readFromStdin (): Promise<string> {
  const chunks: Array<Buffer> = [];
  await new Promise((resolve, reject) => {
    const stdin = process.stdin;

    stdin.on('data', (chunk) => {
      chunks.push(chunk);
    });

    stdin.on('error', reject);
    stdin.on('end', resolve);
  });
  return Buffer.concat(chunks).toString('utf8');
}

async function readFromFile (file: string): Promise<string> {
  return readFileAsync(file, { encoding: 'utf8' });
}

async function run () {
  const input = yargs
    .option('i', {
        alias: 'input',
        describe: 'Input file (stdin is used if not provided)',
        type: 'string'
    })
    .option('o', {
        alias: 'output',
        describe: 'Output file (stdout is used if not provided)',
        type: 'string'
    })
    .option('c', {
        alias: 'clean',
        describe: 'Input data is already cleaned (such as that of terraform show)',
        type: 'boolean',
        default: false
    })
    .option('pretty', {
        describe: 'Output JSON in pretty format',
        type: 'boolean',
        default: false
    })
    .argv;
  if (input.help) {
    return yargs.showHelp();
  }
  const inputData = (input.input)
    ? await readFromFile(input.input)
    : await readFromStdin();

  const json = input.pretty
    ? JSON.stringify(parser.parseStdout(inputData, input.clean), null, '  ')
    : JSON.stringify(parser.parseStdout(inputData, input.clean));

  if (input.output) {
    await writeFileAsync(input.output, json, { encoding: 'utf8' });
  } else {
    process.stdout.write(json);
  }
}

run().catch(function (err) {
  console.error('Error parsing terraform plan. ' + (err.stack || err.toString()));
  process.exitCode = -1;
});
