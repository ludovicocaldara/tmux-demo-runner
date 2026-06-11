# Install and Test tmux Demo Runner

This project is currently dependency-free. You do not need to run `npm install` for the basic development test flow.

## Quick Development Test

1. Open this folder in VS Code:

   ```bash
   code /Users/lcaldara/Documents/github/tmux-demo-runner-vscode
   ```

2. Check the extension, shared runner, and CLI syntax:

   ```bash
   npm run check
   ```

3. Start the extension in a VS Code Extension Development Host:

   - Press `F5`, or
   - Open **Run and Debug** and choose **Run Extension**.

4. Start or attach a tmux session in a normal terminal:

   ```bash
   tmux new-session
   ```

5. In the new Extension Development Host window, open a demo script with **File > Open File...**. For example, open:

   ```text
   /Users/lcaldara/Documents/github/tmux-vim-mappings/testme.bash
   ```

6. To test variable substitution, open or copy the included example instead:

   ```text
   /Users/lcaldara/Documents/github/tmux-demo-runner-vscode/examples/testme.bash
   ```

   It uses values from:

   ```text
   /Users/lcaldara/Documents/github/tmux-demo-runner-vscode/demo-vars.json
   ```

   The example declares that file with this metadata line:

   ```bash
   ---# tmux-demo-runner variablesFile=../demo-vars.json
   ```

7. Put the cursor on a command line and press `PageDown`.

   The extension sends the current line to tmux, executes it, and advances the cursor to the next line.

8. The example first preloads `demo_note` with:

   ```bash
   ---# tmux-demo-runner setInput demo_note "This value was preloaded by setInput"
   ```

   The next `{{input:demo_note}}` uses that cached value without prompting.

9. The example then clears that one input with:

   ```bash
   ---# tmux-demo-runner clearInput demo_note
   ```

   The following `{{input:demo_note}}` prompts in VS Code again.

## Commands to Test

Use these from the editor or from the Command Palette.

| Action | Default key | Command Palette name |
| --- | --- | --- |
| Run current line or selected lines | `PageDown` | `tmux Demo Runner: Run Next` |
| Paste selection without executing | `PageUp` | `tmux Demo Runner: Paste Selection` |

`PageDown` runs the current line when there is no selection. With a single-line selection, it runs that line even when only part of the line is selected. With a multi-line selection, it runs only fully selected lines and skips partially selected first or last lines. After execution, the cursor moves to the next non-executed line.

## Test the CLI

The CLI uses the same runner as the VS Code extension and is the base for Vim/SSH usage.

```bash
node bin/tmux-demo-runner --help
node bin/tmux-demo-runner run-line examples/testme.bash 1
```

The second command expects a running tmux session. Line numbers are 1-based.

When the package is linked or globally installed, the command name is:

```bash
tmux-demo-runner run-line examples/testme.bash 1
```

## Use from Vim

The Vim plugin file is included at:

```text
vim/plugin/tmux-demo-runner.vim
```

For local development, add this repository's `vim` directory to Vim's runtime path:

```vim
set runtimepath+=/Users/lcaldara/Documents/github/tmux-demo-runner-vscode/vim
```

Then add mappings if you want the same stepping keys:

```vim
nmap <PageDown> <Plug>(TmuxDemoRunnerRunNext)
xmap <PageDown> <Plug>(TmuxDemoRunnerRunRange)
nmap <PageUp> <Plug>(TmuxDemoRunnerPasteLine)
xmap <PageUp> <Plug>(TmuxDemoRunnerPasteRange)
```

To target a specific pane:

```vim
let g:tmux_demo_runner_tmux_pane = ':.+'
```

## Demo Syntax to Verify

Create or open a demo file with content like this:

```bash
echo hello from vscode

--- ## This message appears in the VS Code status bar
--- pwd
echo done
```

Expected behavior:

- Plain lines are sent to tmux and executed.
- Blank lines send `Enter`.
- `--- ##` lines show a status message.
- `---` lines run locally after the prefix is removed.

## Use the VS Code Terminal Target

The default target is tmux. To send plain demo lines to a VS Code integrated terminal instead:

1. In the Extension Development Host, open Settings JSON and add:

   ```json
   {
     "tmuxDemoRunner.target": "vscodeTerminal"
   }
   ```

2. Run `PageDown` from a demo script.

The extension creates a VS Code integrated terminal named `tmux Demo Runner` and sends plain demo lines there.

## Use a Custom Variables File

The default variables file is `demo-vars.json` in the workspace folder. To use another JSON file, set `tmuxDemoRunner.variablesFile`:

```json
{
  "tmuxDemoRunner.variablesFile": "demo/demo-vars.local.json"
}
```

Then reference values in the demo script with `{{name}}`:

```bash
---# tmux-demo-runner variablesFile=demo/demo-vars.local.json
--- ## Demo: {{demo_name}}
echo "Presenter: {{presenter}}"
---# tmux-demo-runner setInput demo_note "prepared before the prompt is needed"
echo "Runtime input: {{input:demo_note}}"
---# tmux-demo-runner clearInput demo_note
echo "Bash variables still work: ${USER}"
```

A variables file declared in the demo script overrides the `tmuxDemoRunner.variablesFile` setting. Paths in the demo marker are resolved from the demo script's folder.

Use `---# tmux-demo-runner clearInput` without a name to clear all cached runtime inputs.

## Target a Specific tmux Pane

If you want to target a specific tmux pane, set `tmuxDemoRunner.tmuxPane`:

```json
{
  "tmuxDemoRunner.target": "tmux",
  "tmuxDemoRunner.tmuxPane": ":.+"
}
```

Leave `tmuxDemoRunner.tmuxPane` empty to use tmux's active pane.

## Package and Install Locally

For day-to-day development, `F5` is enough. To install the extension into your normal VS Code profile, package it as a VSIX first.

1. Install the VS Code extension packaging tool if you do not already have it:

   ```bash
   npm install -g @vscode/vsce
   ```

2. Package the extension:

   ```bash
   cd /Users/lcaldara/Documents/github/tmux-demo-runner-vscode
   vsce package
   ```

3. Install the generated VSIX:

   ```bash
   code --install-extension tmux-demo-runner-0.0.1.vsix
   ```

You can also install the VSIX from VS Code with **Extensions: Install from VSIX...**.

## Uninstall a Local VSIX Install

```bash
code --uninstall-extension ludovicocaldara.tmux-demo-runner
```

## Troubleshooting

- If `PageDown` does nothing, make sure the editor has focus and the Extension Development Host window is the active VS Code window.
- If the command appears in the wrong place, click inside the demo script before pressing the key.
- If a keyboard shortcut is already taken, run the command from the Command Palette or change the keybinding in VS Code.
- If tmux mode fails, confirm `tmux` is installed and that a tmux session is running.
