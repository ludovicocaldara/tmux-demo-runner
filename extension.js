const vscode = require('vscode');
const {
  DEFAULT_VARIABLES_FILE,
  DemoRunner,
  TARGET_TMUX,
  createTmuxAdapter,
  pasteTextToTmux,
  runInLocalShell
} = require('./lib/runner');

let terminal;
const runner = new DemoRunner({
  warn: (message) => vscode.window.showWarningMessage(message),
  error: (message) => vscode.window.showErrorMessage(message),
  status: (message) => vscode.window.setStatusBarMessage(message, 3000),
  promptInput
});

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('tmuxDemoRunner.runNext', runNext),
    vscode.commands.registerCommand('tmuxDemoRunner.pasteSelection', pasteSelection)
  );
}

function deactivate() {}

async function runNext() {
  const editor = getEditor();
  if (!editor) {
    return;
  }

  const executableLines = getExecutableLines(editor);
  if (executableLines.lines.length === 0) {
    vscode.window.showWarningMessage('Selection does not contain any fully selected lines to run.');
    return;
  }

  const context = createVariableContext(editor.document);
  await runner.runLines(executableLines.lines, context, getAdapter());
  vscode.window.setStatusBarMessage('tmux Demo Runner: PageDown', 2000);

  moveCursorToLine(editor, executableLines.nextLine);
}

async function pasteSelection() {
  const editor = getEditor();
  if (!editor) {
    return;
  }

  const lines = getSelectedLines(editor);
  if (lines.length === 0) {
    return;
  }

  const context = createVariableContext(editor.document);
  const resolvedText = (await runner.resolveLines(lines, context)).join('\n');

  if (getTarget() === TARGET_TMUX) {
    await pasteTextToTmux(resolvedText, { runShell: runShellWithMessage });
    return;
  }

  getTerminal().sendText(resolvedText, false);
}

function getExecutableLines(editor) {
  if (editor.selection.isEmpty) {
    const lineNumber = editor.selection.active.line;
    return {
      lines: [editor.document.lineAt(lineNumber).text],
      nextLine: lineNumber + 1
    };
  }

  const start = editor.selection.start;
  const end = editor.selection.end;

  if (start.line === end.line) {
    return {
      lines: [editor.document.lineAt(start.line).text],
      nextLine: start.line + 1
    };
  }

  const startLine = start.character === 0 ? start.line : start.line + 1;
  let endLine = end.line;
  if (end.character === 0) {
    endLine -= 1;
  } else if (end.character < editor.document.lineAt(end.line).text.length) {
    endLine -= 1;
  }

  const lines = [];
  for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
    lines.push(editor.document.lineAt(lineNumber).text);
  }

  return {
    lines,
    nextLine: endLine + 1
  };
}

function moveCursorToLine(editor, lineNumber) {
  const nextLine = Math.min(lineNumber, editor.document.lineCount - 1);
  const nextPosition = new vscode.Position(nextLine, 0);
  editor.selection = new vscode.Selection(nextPosition, nextPosition);
  editor.revealRange(new vscode.Range(nextPosition, nextPosition));
}

function getSelectedLines(editor) {
  if (editor.selection.isEmpty) {
    return [editor.document.lineAt(editor.selection.active.line).text];
  }

  const startLine = editor.selection.start.line;
  const endLine = editor.selection.end.character === 0
    ? Math.max(editor.selection.end.line - 1, startLine)
    : editor.selection.end.line;

  const lines = [];
  for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
    lines.push(editor.document.lineAt(lineNumber).text);
  }
  return lines;
}

function getAdapter() {
  if (getTarget() === TARGET_TMUX) {
    return createTmuxAdapter({
      tmuxPane: getConfig().get('tmuxPane', ''),
      runShell: runShellWithMessage,
      displayMessage: (message) => vscode.window.setStatusBarMessage(message, 5000)
    });
  }

  return createTerminalAdapter();
}

function createTerminalAdapter() {
  return {
    sendEnter() {
      getTerminal().sendText('', true);
    },
    sendCommand(action) {
      getTerminal().sendText(action.command, true);
    },
    runShell(action) {
      getTerminal().sendText(action.command, true);
    },
    tmuxCommand(action) {
      getTerminal().sendText(action.command, true);
    },
    displayMessage(action) {
      vscode.window.setStatusBarMessage(action.message, 5000);
    }
  };
}

function createVariableContext(document) {
  return runner.createVariableContext({
    filePath: getDocumentPath(document),
    workspaceFolder: getWorkspaceFolderPath(document),
    variablesFile: getConfig().get('variablesFile', DEFAULT_VARIABLES_FILE),
    lines: getDocumentLines(document)
  });
}

function getDocumentPath(document) {
  return document.uri && document.uri.scheme === 'file' ? document.uri.fsPath : '';
}

function getWorkspaceFolderPath(document) {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  return workspaceFolder ? workspaceFolder.uri.fsPath : '';
}

function getDocumentLines(document) {
  const lines = [];
  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
    lines.push(document.lineAt(lineNumber).text);
  }
  return lines;
}

function getEditor() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Open a demo script before running tmux Demo Runner.');
  }
  return editor;
}

function getTerminal() {
  if (terminal) {
    return terminal;
  }

  terminal = vscode.window.createTerminal(getConfig().get('terminalName', 'tmux Demo Runner'));
  return terminal;
}

function getConfig() {
  return vscode.workspace.getConfiguration('tmuxDemoRunner');
}

function getTarget() {
  return getConfig().get('target', TARGET_TMUX);
}

async function promptInput(name, options) {
  return vscode.window.showInputBox({
    prompt: `tmux Demo Runner value for ${name}`,
    ignoreFocusOut: true,
    password: options.password
  });
}

async function runShellWithMessage(command) {
  const result = await runInLocalShell(command);
  if (result.code !== 0) {
    vscode.window.showErrorMessage(result.stderr || result.stdout || `Command failed with exit code ${result.code}`);
  }
  return result;
}

module.exports = {
  activate,
  deactivate,
  getExecutableLines
};
