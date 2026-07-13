const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const TARGET_TMUX = 'tmux';
const DEFAULT_VARIABLES_FILE = 'demo-vars.json';

class DemoRunner {
  constructor(options = {}) {
    this.inputCache = new Map();
    this.warn = options.warn || (() => {});
    this.error = options.error || (() => {});
    this.status = options.status || (() => {});
    this.promptInput = options.promptInput || defaultPromptInput;
    this.runShell = options.runShell || runInLocalShell;
    this.inputValues = normalizeInputValues(options.inputValues);
  }

  createVariableContext(options) {
    const filePath = options.filePath || '';
    const workspaceFolder = options.workspaceFolder || '';
    const lines = options.lines || readFileLines(filePath);
    const variablesFile = getVariablesFile({
      lines,
      defaultVariablesFile: options.variablesFile || DEFAULT_VARIABLES_FILE
    });

    const builtins = getBuiltins(filePath, workspaceFolder);
    return {
      variables: loadVariablesFile(variablesFile, {
        filePath,
        workspaceFolder,
        warn: this.warn,
        error: this.error
      }),
      builtins
    };
  }

  async resolveLines(lines, context) {
    const resolvedLines = [];
    for (const line of lines) {
      resolvedLines.push(await this.resolveVariables(line, context));
    }
    return resolvedLines;
  }

  async renderLines(lines, context) {
    const renderedLines = [];
    for (const line of lines) {
      const resolvedLine = await this.resolveVariables(line, context);
      renderedLines.push(resolvedLine);

      // Keep metadata directives in the rendered output, but apply their
      // input-cache effects before resolving the next line.
      const actions = parseDemoLine(resolvedLine, this.warn);
      await this.runActions(actions);
    }
    return renderedLines;
  }

  async resolveVariables(line, context) {
    const placeholderPattern = /(^|[^\\])\{\{\s*([^{}]+?)\s*\}\}/g;
    let resolved = '';
    let lastIndex = 0;
    let match;

    while ((match = placeholderPattern.exec(line)) !== null) {
      const [matchedText, prefix, name] = match;
      const value = await this.getVariableValue(name.trim(), context);
      resolved += line.slice(lastIndex, match.index);

      if (value === undefined) {
        this.warn(`tmux Demo Runner variable not found: ${name.trim()}`);
        resolved += matchedText;
      } else {
        resolved += `${prefix}${String(value)}`;
      }

      lastIndex = match.index + matchedText.length;
    }

    resolved += line.slice(lastIndex);
    return resolved.replace(/\\\{\{/g, '{{');
  }

  async getVariableValue(name, context) {
    if (name.startsWith('input:')) {
      return this.getInputValue(name.slice(6).trim());
    }

    if (name.startsWith('env:')) {
      return process.env[name.slice(4).trim()];
    }

    if (Object.prototype.hasOwnProperty.call(context.builtins, name)) {
      return context.builtins[name];
    }

    return getPathValue(context.variables, name);
  }

  async getInputValue(name) {
    if (!name) {
      return undefined;
    }

    if (this.inputCache.has(name)) {
      return this.inputCache.get(name);
    }

    if (this.inputValues.has(name)) {
      const value = this.inputValues.get(name);
      this.inputCache.set(name, value);
      return value;
    }

    const value = await this.promptInput(name, {
      password: /password|passwd|secret|token|key/i.test(name)
    });

    if (value === undefined) {
      return undefined;
    }

    this.inputCache.set(name, value);
    return value;
  }

  async runLines(lines, context, adapter) {
    for (const line of lines) {
      const resolvedLine = await this.resolveVariables(line, context);
      const actions = parseDemoLine(resolvedLine, this.warn);
      await this.runActions(actions, adapter);
    }
  }

  async runActions(actions, adapter) {
    for (const action of actions) {
      switch (action.kind) {
        case 'clearInput':
          this.clearInput(action.name);
          break;
        case 'setInput':
          this.setInput(action.name, action.value);
          break;
        default:
          if (adapter && typeof adapter[action.kind] === 'function') {
            await adapter[action.kind](action);
          }
          break;
      }
    }
  }

  clearInput(name) {
    if (name) {
      this.inputCache.delete(name);
      this.status(`tmux Demo Runner: cleared input ${name}`);
      return;
    }

    this.inputCache.clear();
    this.status('tmux Demo Runner: cleared all inputs');
  }

  setInput(name, value) {
    this.inputCache.set(name, value);
    this.status(`tmux Demo Runner: set input ${name}`);
  }
}

function parseDemoLine(line, warn = () => {}) {
  if (isMetadataLine(line)) {
    return parseMetadataLine(line, warn);
  }

  if (line.length === 0 || line === '---') {
    return [{ kind: 'sendEnter' }];
  }

  if (/^---\s*##/.test(line)) {
    return [{ kind: 'displayMessage', message: line.slice(line.indexOf('##') + 2).trim() }];
  }

  if (line.startsWith('---')) {
    return [{ kind: 'runShell', command: line.slice(3) }];
  }

  if (line.startsWith('tmux ')) {
    return [{ kind: 'tmuxCommand', command: line }];
  }

  return [{ kind: 'sendCommand', command: line }];
}

function parseMetadataLine(line, warn = () => {}) {
  const directive = line.replace(/^---#\s*tmux-demo-runner\s+/, '').trim();

  if (/^variablesFile\s*=/.test(directive)) {
    return [];
  }

  const clearInputMatch = directive.match(/^clearInput(?:\s+(\S+))?$/);
  if (clearInputMatch) {
    return [{ kind: 'clearInput', name: clearInputMatch[1] }];
  }

  const setInputMatch = directive.match(/^setInput\s+(\S+)\s+([\s\S]+)$/);
  if (setInputMatch) {
    return [{
      kind: 'setInput',
      name: setInputMatch[1],
      value: parseDirectiveValue(setInputMatch[2].trim())
    }];
  }

  warn(`Unknown tmux Demo Runner directive: ${directive}`);
  return [];
}

function parseDirectiveValue(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch (_error) {
      return value.slice(1, -1);
    }
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/\\'/g, "'");
  }

  return value;
}

function getVariablesFile(options) {
  const metadataVariablesFile = getVariablesFileFromLines(options.lines || []);
  if (metadataVariablesFile) {
    return {
      path: metadataVariablesFile,
      relativeTo: 'document'
    };
  }

  return {
    path: (options.defaultVariablesFile || DEFAULT_VARIABLES_FILE).trim(),
    relativeTo: 'workspace'
  };
}

function getVariablesFileFromLines(lines) {
  const maxLines = Math.min(lines.length, 50);
  for (let lineNumber = 0; lineNumber < maxLines; lineNumber += 1) {
    const match = lines[lineNumber].match(/^---#\s*tmux-demo-runner\s+variablesFile\s*=\s*(.+?)\s*$/);
    if (match) {
      return match[1].trim();
    }
  }
  return undefined;
}

function normalizeInputValues(inputValues) {
  if (!inputValues) {
    return new Map();
  }

  if (inputValues instanceof Map) {
    return new Map(inputValues);
  }

  if (Array.isArray(inputValues)) {
    return new Map(inputValues);
  }

  return new Map(Object.entries(inputValues));
}

function isMetadataLine(line) {
  return /^---#\s*tmux-demo-runner\s+/.test(line);
}

function loadVariablesFile(variablesFile, options = {}) {
  if (!variablesFile.path) {
    return {};
  }

  const variablesPath = resolveVariablesFilePath(variablesFile, options);
  if (!variablesPath || !fs.existsSync(variablesPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(variablesPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      options.warn?.(`tmux Demo Runner variables file must contain a JSON object: ${variablesPath}`);
      return {};
    }
    return parsed;
  } catch (error) {
    options.error?.(`Could not read tmux Demo Runner variables file: ${error.message}`);
    return {};
  }
}

function resolveVariablesFilePath(variablesFile, options = {}) {
  if (path.isAbsolute(variablesFile.path)) {
    return variablesFile.path;
  }

  if (variablesFile.relativeTo === 'document' && options.filePath) {
    return path.join(path.dirname(options.filePath), variablesFile.path);
  }

  if (options.workspaceFolder) {
    return path.join(options.workspaceFolder, variablesFile.path);
  }

  if (options.filePath) {
    return path.join(path.dirname(options.filePath), variablesFile.path);
  }

  return undefined;
}

function getBuiltins(filePath, workspaceFolder) {
  const file = filePath || '';
  return {
    file,
    fileBasename: file ? path.basename(file) : '',
    fileDirname: file ? path.dirname(file) : '',
    workspaceFolder: workspaceFolder || ''
  };
}

function getPathValue(source, dottedPath) {
  return dottedPath.split('.').reduce((value, key) => {
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key];
    }
    return undefined;
  }, source);
}

function createTmuxAdapter(options = {}) {
  const runShell = options.runShell || runInLocalShell;
  const tmuxPane = options.tmuxPane || '';
  const displayMessage = options.displayMessage;

  return {
    async sendEnter() {
      await runShell(tmuxSendEnterCommand(tmuxPane));
    },
    async sendCommand(action) {
      for (const command of tmuxSendKeysLiteralCommands(tmuxPane, action.command)) {
        await runShell(command);
      }
      await runShell(tmuxSendEnterCommand(tmuxPane));
    },
    async runShell(action) {
      await runShell(action.command);
    },
    async tmuxCommand(action) {
      await runShell(action.command);
    },
    async displayMessage(action) {
      if (displayMessage) {
        displayMessage(action.message);
      }
      await runShell(`tmux display-message -- ${shellQuote(action.message)}`);
    }
  };
}

async function pasteTextToTmux(text, options = {}) {
  const runShell = options.runShell || runInLocalShell;
  const targetArgs = tmuxTargetArgs(options.tmuxPane);
  await runShell(`printf %s ${shellQuote(text)} | tmux load-buffer - && tmux paste-buffer -d${targetArgs ? ` ${targetArgs}` : ''}`);
}

function tmuxTargetArgs(pane) {
  const trimmedPane = (pane || '').trim();
  return trimmedPane ? `-t ${shellQuote(trimmedPane)}` : '';
}

function tmuxSendEnterCommand(pane) {
  const targetArgs = tmuxTargetArgs(pane);
  return `tmux send-keys${targetArgs ? ` ${targetArgs}` : ''} C-M`;
}

function tmuxSendKeysLiteralCommands(pane, value) {
  const targetArgs = tmuxTargetArgs(pane);
  const text = String(value);
  // tmux parses a trailing semicolon as a command separator even with
  // send-keys -l, so keep terminal semicolons out of the literal text.
  const trailingSemicolons = text.match(/;+$/)?.[0].length || 0;
  const literalText = trailingSemicolons ? text.slice(0, -trailingSemicolons) : text;
  const commands = [];

  // Literal mode keeps semicolons in the middle of a line as normal input
  // characters instead of letting tmux split the send-keys command.
  if (literalText.length > 0) {
    commands.push(`tmux send-keys${targetArgs ? ` ${targetArgs}` : ''} -l -- ${shellQuote(literalText)}`);
  }

  // A semicolon at the end of a SQL statement must still be typed into the
  // pane, so send each trailing semicolon as an escaped tmux key argument.
  if (trailingSemicolons > 0) {
    const semicolonArgs = Array(trailingSemicolons).fill(shellQuote('\\;')).join(' ');
    commands.push(`tmux send-keys${targetArgs ? ` ${targetArgs}` : ''} -- ${semicolonArgs}`);
  }

  return commands;
}

function runInLocalShell(command) {
  return new Promise((resolve) => {
    cp.exec(command, (error, stdout, stderr) => {
      if (error) {
        resolve({ code: error.code || 1, stdout, stderr });
        return;
      }
      resolve({ code: 0, stdout, stderr });
    });
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function readFileLines(filePath) {
  if (!filePath) {
    return [];
  }
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
}

function defaultPromptInput(name, options = {}) {
  if (options.password) {
    return promptSecretInput(name);
  }

  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr
    });

    rl.question(`tmux Demo Runner value for ${name}: `, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function promptSecretInput(name) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stderr;
    const prompt = `tmux Demo Runner value for ${name}: `;

    if (!input.isTTY || typeof input.setRawMode !== 'function') {
      reject(new Error(`Cannot securely prompt for ${name}: standard input is not a TTY.`));
      return;
    }

    output.write(prompt);
    input.setRawMode(true);
    input.resume();

    let value = '';
    const onData = (chunk) => {
      const text = chunk.toString('utf8');
      for (const character of text) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('Input cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          output.write('\n');
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= ' ' && character !== '\u007f') {
          value += character;
        }
      }
    };

    const cleanup = () => {
      input.off('data', onData);
      input.setRawMode(false);
      input.pause();
    };

    input.on('data', onData);
  });
}

module.exports = {
  DEFAULT_VARIABLES_FILE,
  TARGET_TMUX,
  DemoRunner,
  createTmuxAdapter,
  getVariablesFileFromLines,
  parseDemoLine,
  pasteTextToTmux,
  readFileLines,
  runInLocalShell,
  shellQuote
};
