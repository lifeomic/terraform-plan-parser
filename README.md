# Terraform Plan Parser

[![Greenkeeper badge](https://badges.greenkeeper.io/lifeomic/terraform-plan-parser.svg)](https://greenkeeper.io/) [![Build Status](https://travis-ci.org/lifeomic/terraform-plan-parser.svg?branch=master)](https://travis-ci.org/lifeomic/terraform-plan-parser) [![Coverage Status](https://coveralls.io/repos/github/lifeomic/terraform-plan-parser/badge.svg?branch=master)](https://coveralls.io/github/lifeomic/terraform-plan-parser?branch=master) [![npm version](https://badge.fury.io/js/terraform-plan-parser.svg)](https://badge.fury.io/js/terraform-plan-parser)

This project provides a CLI and JavaScript API for parsing terraform
plan output.

**IMPORTANT:** This tool does not parse the file produced by the `-out=path`
argument to `terraform plan` which is a binary file. There is not a stable
specification for this binary file format so, at this time, it is safer
to parse the somewhat structured textual output that gets written to `stdout`.

## Why should I use this?

This parser allows the textual log output from `terraform plan` to be converted
to JSON which is more machine readable.

Here are some suggested use cases:

- Send notification when certain types of changes are detected.
  For example, email security team if an IAM policy is modified.
- Validate that certain changes are allowed for a given _change management_
  request before invoking `terraform apply`.
- Kick-off a special workflow for certain types of changes to the
  infrastructure (possibly, before calling `terraform apply`).

If you wish to perform linting or enforcement of best practices then your
better option might be to analyze the source terraform code instead of
only looking at the changes that are described by the `terraform plan`
output.

## Usage

### JavaScript API

**NPM:**

```bash
npm install terraform-plan-parser
```

**Yarn Package Manager:**

```bash
yarn add terraform-plan-parser
```

**IMPORTANT:**

This project requires [Node v8.9.0 (LTS)](https://nodejs.org/en/blog/release/v8.9.0/)
or newer because the source code utilizes language features such as
`async` / `await`. If you are using an unsupported version of Node then you
will see `SyntaxError: Unexpected token function`. It's possible to use
`babel` to transpile the code for older versions of the Node runtime.
The [babel-preset-env](https://github.com/babel/babel/tree/master/packages/babel-preset-env)
is a good package for supporting this.

### Parse string that contains stdout logs from terraform plan

```javascript
const fs = require('fs');
const parser = require('terraform-plan-parser');

const stdout = fs.readFileSync('terraform-plan.stdout', {encoding: 'utf8'});
const result = parser.parseStdout(stdout);
```

### Command Line

**NPM:**

```bash
npm install -g terraform-plan-parser
```

**Yarn Package Manager:**

```bash
yarn add global terraform-plan-parser
```

**Command help:**

```bash
# Get help on using command
parse-terraform-plan --help
```

```
Options:
  --help        Show help                                                   [boolean]
  --version     Show version number                                         [boolean]
  -i, --input   Input file (stdin is used if not provided)                  [string]
  -o, --output  Output file (stdout is used if not provided)                [string]
  -c, --clean   Input is already clean, only containing resource changes    [boolean]
  --pretty      Output JSON in pretty format          [boolean] [default: false]
```

**Read from stdin and write to stdout**:

```bash
# Pipe output from "terraform plan" to parser which will convert it to JSON
terraform plan | parse-terraform-plan --pretty
```

**Read from file and write to file**:

```bash
# Store "terraform plan" output in file
terraform plan > terraform-plan.stdout

# Read from "terraform plan" output file and write to JSON file
parse-terraform-plan --pretty -i terraform-plan.stdout -o terraform-plan.json
```

## Output Schema

The output is an object with these top-level properties:

- **`errors`:** An array of parsing errors
- **`changedResources`:** An array of changed resources
- **`changedDataSources`:** An array of changed data sources

Each _changed resource_ has the following properties:

- **`action`:** One of `"create"`, `"destroy"`, `"replace"`, `"update"`
- **`type`:** Type of resource (e.g. `"aws_ecs_service"`)
- **`name`:** Resource name (e.g. `"my_service"`)
- **`path`:** Full path to resource as printed in plan output (e.g. `"module.module1.module.module2.aws_ecs_service.my_service"`)
- **`module`:** Fully qualified module name (e.g. `"module1.module2"`) or `undefined` if resource not within module.
- **`changedAttributes`:** An object whose keys are an attribute name and value is an object
- **`newResourceRequired`:** A flag to indicate if a new resource is required (only present if `true`)
- **`tainted`:** A flag to indicate if resource is tainted (only present if `true`)

A _changed attribute_ object has the following properties:

- **`old`:** An object with `type` property and `value` property which
  describes the old state of the attribute.
  The `type` will be `"computed"` or `"string"`. The `value` will be a string.
- **`new`:** An object with `type` property and `value` property which
  describes the new state of the attribute.
  The `type` will be `"computed"` or `"string"`. The `value` will be a string.

Each _data source_ has the following properties:

- **`action`:** The action will always be `"read"`
- **`type`:** Type of resource (e.g. `"external"`)
- **`name`:** Data source name (e.g. `"ecr_image_digests"`)
- **`path`:** Full path to data source as printed in plan output (e.g. `"module.module1.module.module2.data.external.ecr_image_digests"`)
- **`module`:** Fully qualified module name (e.g. `"module1.module2"`) or `undefined` if data source not within module.
- **`changedAttributes`:** An object whose keys are an attribute name and value is an object

## Example Output

```json
{
  "errors": [],
  "changedResources": [
    {
      "action": "update",
      "type": "aws_ecs_service",
      "name": "sample_app",
      "path": "aws_ecs_service.sample_app",
      "changedAttributes": {
        "task_definition": {
          "old": {
            "type": "string",
            "value": "arn:aws:ecs:us-east-1:123123123123:task-definition/sample-app:186"
          },
          "new": {
            "type": "string",
            "value": "${ aws_ecs_task_definition.sample_app.arn }"
          }
        }
      }
    }
  ],
  "changedDataSources": [
    {
      "action": "read",
      "type": "external",
      "name": "ecr_image_digests",
      "path": "data.external.ecr_image_digests",
      "changedAttributes": {
        "id": {
          "new": {
            "type": "computed"
          }
        },
        "program.#": {
          "new": {
            "type": "string",
            "value": "1"
          }
        },
        "program.0": {
          "new": {
            "type": "string",
            "value": "extract-image-digests"
          }
        },
        "result.%": {
          "new": {
            "type": "computed"
          }
        }
      }
    }
  ]
}
```
