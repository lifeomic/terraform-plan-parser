const stripAnsi = require('strip-ansi');
import endsWith from './util/endsWith';

export enum Action {
  CREATE = 'create',
  DESTROY = 'destroy',
  REPLACE = 'replace',
  UPDATE = 'update',
  READ = 'read'
}

export interface ChangedAttributesMap {
  [key: string]: ChangedAttribute;
}

export interface Changed {
  module: string;
  action: Action;
  type: string;
  name: string;
  path: string;
  changedAttributes: ChangedAttributesMap;
  newResourceRequired: boolean;
  tainted: boolean;
}

export enum AttributeValueType {
  UNKNOWN = 'unknown',
  STRING = 'string',
  COMPUTED = 'computed'
}

export interface AttributeValue {
  type: AttributeValueType;
  value: string;
}

export interface ChangedAttribute {
  new: AttributeValue;
  old: AttributeValue;
  forcesNewResource: boolean;
}

export class ParseError {
  code: String;
  message: String;
}

export interface ParseResult {
  errors: Array<ParseError>;
  changedResources: Array<Changed>;
  changedDataSources: Array<Changed>;
}

const NO_CHANGES_STRING = '\nNo changes. Infrastructure is up-to-date.\n';
const CONTENT_START_STRING = '\nTerraform will perform the following actions:\n';
const CONTENT_END_STRING = '\nPlan:';
const OLD_NEW_SEPARATOR = ' => ';
const ATTRIBUTE_FORCES_NEW_RESOURCE_SUFFIX = ' (forces new resource)';

/**
 * Find the starting position within terraform stdout that we should try
 * to parse.
 *
 * @param logOutput terraform log output
 * @return the position at which parsing should begin or -1 if not found
 */
function findParseableContentStartPos (logOutput: string): number {
  const pos = logOutput.indexOf(CONTENT_START_STRING);
  return (pos === -1) ? pos : pos + CONTENT_START_STRING.length;
}

/**
 * Find the ending position within terraform stdout that we should try
 * to parse.
 *
 * @param logOutput terraform log output
 * @return the position at which parsing should end or -1 if not found
 */
function findParseableContentEndPos (logOutput: string, startPos: number): number {
  return logOutput.indexOf(CONTENT_END_STRING, startPos);
}

interface ActionMapping {
  [key: string]: Action;
}

const ACTION_MAPPING: ActionMapping = {};

ACTION_MAPPING['+'] = Action.CREATE;
ACTION_MAPPING['-'] = Action.DESTROY;
ACTION_MAPPING['-/+'] = Action.REPLACE;
ACTION_MAPPING['~'] = Action.UPDATE;
ACTION_MAPPING['<='] = Action.READ;

const ACTION_LINE_REGEX = /^(?:((?:.*\.)?module\.[^.]*)\.)?(?:(data)\.)?([^.]+)\.([^ ]+)( \(tainted\))?( \(new resource required\))?$/;
const ATTRIBUTE_LINE_REGEX = /^ {6}[^ ]/;

// Convert something like "module.test1.module.test2" to "test1.test2"
function parseModulePath (rawModuleStr: string) {
  return rawModuleStr.split(/\.?module./).slice(1).join('.');
}

/**
 * Parse a line that looks similar to a resource or data source.
 *
 * Example line for resource:
 * ```
 * -/+ aws_ecs_task_definition.sample_app (new resource required)
 * ```
 *
 * Example line for data source:
 * ```
 * <= data.external.ecr_image_digests
 * ```
 * @param line current line within stdout text
 * @param action the pre-determined action which was found by looking at start of line
 * @param result an object that collects changed data sources, changed resources, and errors
 * @return an object that identifies a changed resource or data sources
 */
function parseActionLine (offset: number, line: string, action: Action, result: ParseResult): Changed | null {
  // start position is after the action symbol
  // For example, we move past "-/+ " (4 characters)
  const match = ACTION_LINE_REGEX.exec(line.substring(offset));

  if (!match) {
    result.errors.push({
      code: 'UNABLE_TO_PARSE_CHANGE_LINE',
      message: `Unable to parse "${line}" (ignoring)`
    });
    return null;
  }

  const [, module, dataSourceStr, type, name, taintedStr, newResourceRequiredStr] = match;
  const fullyQualifiedPath = [module, dataSourceStr, type, name].filter(str =>
    str && str.length > 0).join('.');

  let change;
  change = {
    action: action,
    type: type,
    name: name,
    path: fullyQualifiedPath,
    changedAttributes: {}
  } as Changed;

  if (module) {
    change.module = parseModulePath(module);
  }

  if (taintedStr === ' (tainted)') {
    change.tainted = true;
  }

  if (dataSourceStr) {
    result.changedDataSources.push(change);
  } else {
    if (newResourceRequiredStr) {
      change.newResourceRequired = true;
    }

    result.changedResources.push(change);
  }
  return change;
}

/**
 * Find the position of next non-space character or -1 if we didn't
 * find a non-space character
 * @param str a string
 * @param fromIndex the starting position
 * @return the next position within string that is non-space character or -1 if not found
 */
function findPosOfNextNonSpaceChar (str: string, fromIndex: number): number {
  let pos = fromIndex;
  const end = str.length;
  while (pos < end) {
    if (str.charAt(pos) !== ' ') {
      return pos;
    }
    pos++;
  }
  return -1;
}

/**
 * Read ahead in a string until we ecounter the given terminator character or end of string
 * @param str a string
 * @param fromIndex the starting position
 * @param terminatorChar a terminator string of length 1
 * @return the substring from `fromIndex` up to (but not including) the terminator character
 */
function readUpToChar (str: string, fromIndex: number, terminatorChar: string): string | null {
  let pos = fromIndex;
  const end = str.length;
  while (pos < end) {
    if (str.charAt(pos) === terminatorChar) {
      return str.substring(fromIndex, pos);
    }
    pos++;
  }

  return null;
}

/**
 * [findStringEndDelimiterPos description]
 * @param str the string that contains a quoted string that needs to be parsed
 * @param fromIndex the position of the first character after the `"` character
 * @return the position of the ending `"` or -1 if the string is unterminated
 */
function findStringEndDelimiterPos (str: string, fromIndex: number): number {
  let pos = fromIndex;
  let escaped = false;
  const end = str.length;
  while (pos < end) {
    if (escaped) {
      escaped = false;
    } else {
      if (str.charAt(pos) === '"') {
        return pos;
      } else if (str.charAt(pos) === '\\') {
        escaped = true;
      }
    }
    pos++;
  }

  return -1;
}

/**
 * This function is used to parse values such as:
 * `<computed>`
 * `"arn:aws:iam::123123123123:role/SampleApp"`
 *
 * @param line the line read from terraform stdout content
 * @param fromIndex the starting position of a _value_
 * @param errors an array that collects errors
 * @return an array with two items (first item is result value object and second item is the end position of the value)
 */
function parseValue (line: string, fromIndex: number, errors: Array<ParseError>): [AttributeValue, number] {
  const foundDelimiter = line.charAt(fromIndex);
  let endPos: number;
  let type: AttributeValueType | undefined;
  let value;

  if (foundDelimiter === '"') {
    endPos = findStringEndDelimiterPos(line, fromIndex + 1);
    if (endPos === -1) {
      endPos = line.length;
      value = line.substring(fromIndex, endPos);
      errors.push({
        code: 'UNTERMINATED_STRING',
        message: `Unterminated string on line "${line}"`
      });
    } else {
      type = AttributeValueType.STRING;
      value = JSON.parse(line.substring(fromIndex, endPos + 1));
    }
  } else if (foundDelimiter === '<') {
    const contents = readUpToChar(line, fromIndex + 1, '>');
    if (contents === null) {
      // we did not find the terminator character
      value = line.substring(fromIndex);
      endPos = line.length;
    } else {
      if (contents === 'computed') {
        type = AttributeValueType.COMPUTED;
      } else {
        value = line.substring(fromIndex, fromIndex + contents.length + 1);
      }
      endPos = fromIndex + contents.length + 1;
    }
  } else {
    value = line.substring(fromIndex);
    endPos = fromIndex + value.length;
  }

  const result = {} as AttributeValue;
  result.type = type || AttributeValueType.UNKNOWN;

  if (value !== undefined) {
    result.value = value;
  }

  return [result, endPos];
}

/**
 * Parses a line that we think looks like an attribute because it starts
 * with six spaces and then a non-space character.
 *
 * @param line the line that looks like an attribute change
 * @param lastChange the change object for resource or data source that will hold attribute
 * @param errors an array that will collect errors
 */
function parseAttributeLine (line: string, lastChange: Changed, errors: Array<ParseError>) {
  let startPos = 6;
  const nameEndPos = line.indexOf(':', startPos + 1);
  if (nameEndPos === -1) {
    errors.push({
      code: 'UNABLE_TO_PARSE_ATTRIBUTE_NAME',
      message: `Attribute name not found on line "${line}" (ignored)`
    });
    return;
  }

  let oldObj: AttributeValue | undefined;
  let newObj: AttributeValue | undefined;
  let forcesNewResource;

  const name = line.substring(startPos, nameEndPos);
  startPos = findPosOfNextNonSpaceChar(line, nameEndPos + 1);
  if (startPos !== -1) {
    const [firstObj, firstValueEndPos] = parseValue(line, startPos, errors);
    startPos = firstValueEndPos + 1;

    if (line.substring(startPos, startPos + OLD_NEW_SEPARATOR.length) === OLD_NEW_SEPARATOR) {
      // there is a " => " so we have an old and new value
      [newObj] = parseValue(line, startPos + OLD_NEW_SEPARATOR.length, errors);
      oldObj = firstObj;
    } else {
      // there is no " => " so we only have a new value
      newObj = firstObj;
    }

    if (endsWith(line, ATTRIBUTE_FORCES_NEW_RESOURCE_SUFFIX)) {
      forcesNewResource = true;
    }
  }

  const result = {} as ChangedAttribute;

  if (oldObj) {
    result.old = oldObj;
  }

  if (newObj) {
    result.new = newObj;
  }

  if (forcesNewResource) {
    result.forcesNewResource = true;
  }

  lastChange.changedAttributes[name] = result;
}

export function parseStdout (logOutput: string): ParseResult {
  logOutput = stripAnsi(logOutput).replace(/\r\n/g, '\n');

  const result = {} as ParseResult;
  result.errors = [];
  result.changedResources = [];
  result.changedDataSources = [];

  let lastChange = null;

  if (logOutput.includes(NO_CHANGES_STRING)) {
    // no changes to parse...
    return result;
  }

  const startPos = findParseableContentStartPos(logOutput);
  if (startPos === -1) {
    result.errors.push({
      code: 'UNABLE_TO_FIND_STARTING_POSITION_WITHIN_STDOUT',
      message: `Did not find magic starting string: ${CONTENT_START_STRING}`
    });
    return result;
  }

  const endPos = findParseableContentEndPos(logOutput, startPos);

  if (endPos === -1) {
    result.errors.push({
      code: 'UNABLE_TO_FIND_ENDING_POSITION_WITHIN_STDOUT',
      message: `Did not find magic ending string: ${CONTENT_END_STRING}`
    });
    return result;
  }

  const changesText = logOutput.substring(startPos, endPos);
  const lines = changesText.split('\n');

  for (const line of lines) {
    if (line.length === 0) {
      // blank lines separate each resource / data source.
      lastChange = null;
      continue;
    }

    let offset;
    let possibleActionSymbol = line.substring(0, 3).trim();
    const spacePos = possibleActionSymbol.lastIndexOf(' ');
    if (spacePos === -1) {
      // action line is something like:
      // "-/+ aws_ecs_task_definition.sample_app (new resource required)"
      offset = 4;
    } else {
      // action line is something like:
      // "+ aws_iam_role.terraform_demo"
      offset = spacePos + 1;
      possibleActionSymbol = possibleActionSymbol.substring(0, spacePos);
    }

    const action = ACTION_MAPPING[possibleActionSymbol];

    if (action) {
      // line starts with an action symbol so it will be followed by
      // something like "data.external.ecr_image_digests"
      // or "aws_ecs_task_definition.sample_app (new resource required)"
      lastChange = parseActionLine(offset, line, action, result);
    } else if (ATTRIBUTE_LINE_REGEX.test(line)) {
      if (lastChange) {
        parseAttributeLine(line, lastChange, result.errors);
      } else {
        // This line looks like an attribute but there is no resource
        // or data source that will hold it.
        result.errors.push({
          code: 'ORPHAN_ATTRIBUTE_LINE',
          message: `Attribute line "${line}" is not associated with a data source or resource (ignoring)`
        });
      }
    } else {
      // We don't recognize what this line is....
      result.errors.push({
        code: 'UNABLE_TO_PARSE_LINE',
        message: `Unable to parse "${line}" (ignoring)`
      });
    }
  }

  return result;
}
