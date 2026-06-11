# tmux Demo Runner

Run tmux-style demo scripts from VS Code, Vim, or a plain shell while the actual demo commands execute in a tmux session.

This project is a VS Code-friendly descendant of `tmux-vim-mappings`: your editor becomes the presenter console, tmux remains the live demo environment, and the demo script syntax stays compatible with the original Vim workflow. The demo language is implemented once in a shared Node runner, with VS Code and Vim acting as thin frontends.

![tmux Demo Runner demo placeholder](media/demo.gif)

> TODO: Replace `media/demo.gif` with a recording of VS Code driving a tmux demo session.

## How It Works

Open, create, or edit a demo script in VS Code or Vim, start a tmux session in a terminal, then run the current script line or selected lines in tmux. The cursor advances to the next non-executed line so a presenter can step through a demo with a keyboard, clicker, or command/action palette.

By default:

- Plain lines are sent to tmux and executed with `Enter`.
- Blank lines send `Enter` to tmux.
- Lines starting with `---` run locally after the prefix is removed.
- Lines starting with `--- ##` show a tmux status message instead of running a command.
- Lines starting with `tmux ` are executed as tmux commands for compatibility.
- `{{name}}` placeholders are resolved from a JSON variables file at execution time.

## Quick Demo Flow

1. Open this extension project in VS Code:

   ```bash
   code /Users/lcaldara/Documents/github/tmux-demo-runner-vscode
   ```

2. Start a tmux session in a terminal:

   ```bash
   tmux new-session
   ```

3. Launch the extension from VS Code:

   - Press `F5`, or
   - Open **Run and Debug** and choose **Run Extension**.

4. In the Extension Development Host window, open the included demo script:

   ```text
   examples/testme.bash
   ```

5. Put the cursor on the first line and press `PageDown`.

6. Keep pressing `PageDown` to step through the demo. Plain commands run in tmux; local control lines beginning with `---` run from VS Code's extension host environment.

## Included Example

The repository includes a sample demo script at [examples/testme.bash](examples/testme.bash).
It uses values from [demo-vars.json](demo-vars.json), which is the default variables file.

A smaller example looks like this:

```text
---# tmux-demo-runner variablesFile=../demo-vars.json
--- ## Prepare tmux panes for {{demo_name}}
---tmux split-window
---tmux select-pane -t {{target_pane}}
---# tmux-demo-runner setInput demo_note "This value was preloaded"

echo "This command runs in tmux for {{presenter}}"
echo "Runtime note: {{input:demo_note}}"
echo "Shell variables still work normally: ${USER}"
---# tmux-demo-runner clearInput demo_note
date

--- ## This local line selects the second pane
---tmux select-pane -t :.1
echo "Now this runs in the selected tmux pane"
```

In that example:

- `--- ## ...` displays a presenter/status message.
- `---tmux split-window` runs locally as a tmux control command.
- `echo ...` and `date` are typed into the active tmux pane and executed.
- `{{demo_name}}`, `{{target_pane}}`, and `{{presenter}}` are replaced by the extension before execution.
- `{{input:demo_note}}` prompts once in VS Code and reuses the value for the current extension session.
- `setInput` preloads a runtime input value, and `clearInput` resets it.
- `${USER}` is left alone for Bash to expand.

## Commands

### VS Code

| Action | Default key | Command Palette name |
| --- | --- | --- |
| Run current line or selected lines | `PageDown` | `tmux Demo Runner: Run Next` |
| Paste selection without executing | `PageUp` | `tmux Demo Runner: Paste Selection` |

`PageDown` uses these selection rules:

- With no selection, it runs the current line.
- With a single-line selection, it runs that line even when only part of the line is selected.
- With a multi-line selection, it runs only fully selected lines. Partially selected first or last lines are skipped.
- After execution, the cursor moves to the next non-executed line.

### CLI

The package also exposes a `tmux-demo-runner` command for SSH/Linux environments where VS Code is not available:

```bash
tmux-demo-runner run-line examples/testme.bash 12
tmux-demo-runner run-range examples/testme.bash 12 18
tmux-demo-runner paste-line examples/testme.bash 12
tmux-demo-runner paste-range examples/testme.bash 12 18
```

Line numbers are 1-based. Optional flags:

```bash
tmux-demo-runner run-line demo.bash 12 --tmux-pane :.+ --variables-file demo-vars.json --workspace-folder "$PWD"
```

### Vim

The Vim plugin lives in [vim/plugin/tmux-demo-runner.vim](vim/plugin/tmux-demo-runner.vim). It shells out to the CLI, so make sure `tmux-demo-runner` is on your `PATH`.

Commands:

| Action | Vim command |
| --- | --- |
| Run current line | `:TmuxDemoRunnerRunNext` |
| Run selected range | `:'<,'>TmuxDemoRunnerRunRange` |
| Paste current line | `:TmuxDemoRunnerPasteLine` |
| Paste selected range | `:'<,'>TmuxDemoRunnerPasteRange` |

Suggested mappings:

```vim
nmap <PageDown> <Plug>(TmuxDemoRunnerRunNext)
xmap <PageDown> <Plug>(TmuxDemoRunnerRunRange)
nmap <PageUp> <Plug>(TmuxDemoRunnerPasteLine)
xmap <PageUp> <Plug>(TmuxDemoRunnerPasteRange)
```

To target a specific tmux pane from Vim:

```vim
let g:tmux_demo_runner_tmux_pane = ':.+'
```

## Demo Script Syntax

### Plain Commands

Plain lines are sent to the active tmux pane and executed:

```bash
hostname
date
curl -I https://example.com
```

### Blank Lines

Blank lines send `Enter` to tmux. Use a `---#` comment line when you want a visual separator in the script without sending anything.

```bash
echo before

---# this line is a local shell comment and has no visible effect
echo after
```

### Local Control Commands

Lines starting with `---` run locally after the prefix is removed. This is useful for tmux setup, pane selection, sleeps, and other presenter-side control commands.

```bash
---tmux split-window
---tmux select-pane -t :.1
---sleep 2
```

### Presenter Messages

Lines starting with `--- ##` show a message instead of running a command.

```bash
--- ## Switching to the database pane
```

### Compatibility tmux Commands

Lines starting with `tmux ` are executed as tmux commands for compatibility with older demo scripts.

```bash
tmux display-message "hello from tmux"
```

## Variables

Use `{{name}}` placeholders for values that should be resolved by tmux Demo Runner before a line runs. This avoids conflicts with Bash variables like `$HOME` and `${USER}`.

By default, variables are loaded from `demo-vars.json` in the workspace folder:

```json
{
  "demo_name": "tmux Demo Runner",
  "presenter": "Ludo",
  "target_pane": ":.1",
  "message": {
    "plain_line": "This line was rendered from demo-vars.json"
  }
}
```

Demo scripts can reference top-level or nested values:

```bash
--- ## Demo: {{demo_name}} by {{presenter}}
---tmux select-pane -t {{target_pane}}
echo "{{message.plain_line}}"
echo "Bash still expands this: ${USER}"
```

The demo file can also choose its own variables file with a metadata comment:

```bash
---# tmux-demo-runner variablesFile=../demo-vars.json
```

That marker is ignored during execution. It is read from the first 50 lines of the demo file and takes precedence over the `tmuxDemoRunner.variablesFile` VS Code setting. Relative paths in the marker are resolved from the demo script's folder.

You can also reference environment variables:

```bash
echo "Running as {{env:USER}}"
```

For runtime values, use `{{input:name}}`:

```bash
echo "Compartment: {{input:compartment_ocid}}"
echo "Password: {{input:database_password}}"
```

The first time an input placeholder is used, VS Code prompts for a value. The value is cached for the current extension session and reused when the same input name appears again. Input names containing `password`, `passwd`, `secret`, `token`, or `key` use a password-style prompt.

Demo scripts can manage the input cache with metadata directives:

```bash
---# tmux-demo-runner setInput demo_note "value follows as a longer string in quotes"
echo "{{input:demo_note}}"
---# tmux-demo-runner clearInput demo_note
echo "{{input:demo_note}}"
---# tmux-demo-runner clearInput
```

- `setInput name "value"` sets the cached value before it is needed, so `{{input:name}}` does not prompt.
- `clearInput name` clears one cached input value.
- `clearInput` clears all cached input values.
- Directives run in order, so they work inside selected blocks too.

Built-in variables are available without adding them to the JSON file:

```bash
echo "Workspace: {{workspaceFolder}}"
echo "Current file: {{file}}"
echo "Current file name: {{fileBasename}}"
echo "Current file directory: {{fileDirname}}"
```

To print literal braces, escape the opening braces:

```bash
echo "This is literal: \{{demo_name}}"
```

## Settings

- `tmuxDemoRunner.target`: `tmux` or `vscodeTerminal`. Defaults to `tmux`.
- `tmuxDemoRunner.tmuxPane`: optional tmux pane target, for example `:.+` or `%1`. Leave empty to use tmux's active pane.
- `tmuxDemoRunner.terminalName`: integrated terminal name used only when `tmuxDemoRunner.target` is `vscodeTerminal`.
- `tmuxDemoRunner.variablesFile`: JSON file used for `{{name}}` substitutions. Defaults to `demo-vars.json`.

Example Settings JSON for a specific tmux pane:

```json
{
  "tmuxDemoRunner.target": "tmux",
  "tmuxDemoRunner.tmuxPane": ":.+"
}
```

Example Settings JSON for the integrated-terminal fallback:

```json
{
  "tmuxDemoRunner.target": "vscodeTerminal"
}
```

Example Settings JSON for a custom variables file:

```json
{
  "tmuxDemoRunner.variablesFile": "demo/demo-vars.local.json"
}
```

Relative paths in the `tmuxDemoRunner.variablesFile` setting are resolved from the workspace folder. If there is no workspace folder, they are resolved from the demo script's folder. A `---# tmux-demo-runner variablesFile=...` marker in the demo file (recommended) overrides this setting, and marker paths are resolved from the demo script's folder.

## Development

Run the syntax check:

```bash
npm run check
```

Launch an Extension Development Host from VS Code with `F5`.

See [INSTALL.md](INSTALL.md) for detailed local install, test, package, and uninstall instructions.
