# git-diff-node-modules

A small executable package that displays a diff over changed files inside your
`node_modules` folders.

An example use-case would be to see a diff after a debugging session where you
don't remember every change you did inside your `node_modules` folder.

## installation

_global installation is preferred_

When installed globally this package will be available as a git subcommand:

```
$ git diff-node-modules
```

## Requirements

- Tested only on Linux
- Node >= 8.10.0
- `package-lock.json` or `yarn.lock` **must** be present

## Usage

- `cd` into your project directory
- edit some files inside `node_modules`
- execute `git diff-node-modules`
