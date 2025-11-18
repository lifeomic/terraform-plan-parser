import { promisify } from 'util';
import test from 'ava';
import * as path from 'path';
import * as fs from 'fs';
import { parseStdout, ParseResult, ParseOptions } from '../../src';

const readFileAsync = promisify(fs.readFile);

function readExpected (dataFile: string): ParseResult {
  const dataObj: any = require(path.join(__dirname,'data', dataFile + '.expected.json'));
  return dataObj as ParseResult;
}

async function readActual (dataFile: string, options?: ParseOptions): Promise<ParseResult> {
  const stdout = await readFileAsync(path.join(__dirname, 'data', dataFile + '.stdout.txt'),
    { encoding: 'utf8' });
  return parseStdout(stdout, options);
}

async function runTest (dataName: string, t: any, options?: ParseOptions) {
  const actual = await readActual(dataName, options);
  const expected = readExpected(dataName);
  t.deepEqual(actual, expected);
}

test('should strip ansi color codes', async (t) => {
  const opts = {
    'clean': false
  };
  return runTest('00-terraform-plan', t, opts);
});

test('should parse terraform output - 01', async (t) => {
  const opts = {
    'clean': false
  };
  return runTest('01-terraform-plan', t, opts);
});

test('should parse terraform output and be fairly lenient - 02', async (t) => {
  const opts = {
    'clean': false
  };
  return runTest('02-terraform-plan', t, opts);
});

test('should parse terraform output and support all types of changes - 03', async (t) => {
  const opts = {
    'clean': false
  };
  return runTest('03-terraform-plan', t, opts);
});

test('should fail gracefully if no magic start string is found', async (t) => {
  const opts = {
    'clean': false
  };
  return runTest('04-no-magic-start', t, opts);
});

test('should fail gracefully if no magic end string is found', async (t) => {
  const opts = {
    'clean': false
  };
  return runTest('05-no-magic-end', t, opts);
});

test('should handle unexpected attribute value that is not delimited', async (t) => {
  const opts = {
    'clean': false
  };
  return runTest('06-attribute-value-unexpected-delimiter', t, opts);
});

test('should ignore invalid resource action line', async (t) => {
  const opts = {
    'clean': false
  };
  return runTest('07-invalid-action-line', t, opts);
});

test('should ignore attribute with missing name', async (t) => {
  const opts = {
    'clean': false
  };
  return runTest('08-no-attribute-name', t, opts);
});

test('should handle plan output with Windows line terminator', async (t) => {
  const opts = {
    'clean': false
  };
  return runTest('09-terraform-plan-windows-line-end', t, opts);
});

test('should handle sample provided in issue #4', async (t) => {
  const opts = {
    'clean': false
  };
  return runTest('10-issue-4', t, opts);
});

test('should handle tainted resources', async (t) => {
  const opts = {
    'clean': false
  };
  return runTest('11-tainted-resource', t, opts);
});

test('should handle modules', async (t) => {
  const opts = {
    'clean': false
  };
  return runTest('12-modules', t, opts);
});

test('should handle no changes', async (t) => {
  const opts = {
    'clean': false
  };
  return runTest('13-no-changes', t, opts);
});

test('should handle cleaned input', async (t) => {
  const opts = {
    'clean': true
  };
  return runTest('14-cleaned-input', t, opts);
});

test('should handle cleaned no changes', async (t) => {
  const opts = {
    'clean': true
  };
  return runTest('15-cleaned-no-changes', t, opts);
});

test('should handle no parse options', async (t) => {
  return runTest('00-terraform-plan', t);
});

test('should ignore unchanged attributes', async (t) => {
  return runTest('14-ignore-unchanged-attributes', t);
});
