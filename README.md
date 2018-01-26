# Terraform Plan Parser

[![Greenkeeper badge](https://badges.greenkeeper.io/lifeomic/terraform-plan-parser.svg)](https://greenkeeper.io/)

[![Build Status](https://travis-ci.org/lifeomic/terraform-plan-parser.svg?branch=master)](https://travis-ci.org/lifeomic/terraform-plan-parser)

[![Coverage Status](https://coveralls.io/repos/github/lifeomic/terraform-plan-parser/badge.svg?branch=master)](https://coveralls.io/github/lifeomic/terraform-plan-parser?branch=master)

This project provides a CLI and JavaScript API for parsing terraform
plan output.

**IMPORTANT:** This tool does not parse the file produced by the `-out=path`
argument to `terraform plan` which is a binary file. There is not a stable
specification for this binary file format so, at this time, it is safer
to parse the somewhat structured textual output that gets written to `stdout`.

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

### Parse string that contains stdout logs from terraform plan

```javascript
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
  --help        Show help                                              [boolean]
  --version     Show version number                                    [boolean]
  -i, --input   Input file (stdin is used if not provided)              [string]
  -o, --output  Output file (stdout is used if not provided)            [string]
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
- **`changedAttributes`:** An object whose keys are an attribute name and value is an object
- **`newResourceRequired`:** A flag to indicate if a new resource is required (only present if `true`)

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
