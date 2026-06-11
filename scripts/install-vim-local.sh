#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
bin_dir="${HOME}/.local/bin"
vim_package_dir="${HOME}/.vim/pack/tmux-demo-runner/start/tmux-demo-runner"
vimrc="${HOME}/.vimrc"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required but was not found on PATH." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found on PATH." >&2
  exit 1
fi

(cd "$repo_dir" && npm run check)

mkdir -p "$bin_dir"
ln -sf "$repo_dir/bin/tmux-demo-runner" "$bin_dir/tmux-demo-runner"
chmod +x "$repo_dir/bin/tmux-demo-runner"

mkdir -p "$vim_package_dir/plugin"
cp "$repo_dir/vim/plugin/tmux-demo-runner.vim" "$vim_package_dir/plugin/tmux-demo-runner.vim"

touch "$vimrc"
if ! grep -Fq '" tmux-demo-runner mappings' "$vimrc"; then
  cat >>"$vimrc" <<'VIMRC'

" tmux-demo-runner mappings
nmap <PageDown> <Plug>(TmuxDemoRunnerRunNext)
xmap <PageDown> <Plug>(TmuxDemoRunnerRunRange)
nmap <PageUp> <Plug>(TmuxDemoRunnerPasteLine)
xmap <PageUp> <Plug>(TmuxDemoRunnerPasteRange)
" let g:tmux_demo_runner_tmux_pane = ':.+'
VIMRC
fi

case ":$PATH:" in
  *":$bin_dir:"*) path_already_configured=1 ;;
  *) path_already_configured=0 ;;
esac

shell_rc=""
case "${SHELL:-}" in
  */zsh) shell_rc="${HOME}/.zshrc" ;;
  */bash) shell_rc="${HOME}/.bashrc" ;;
esac

if [ "$path_already_configured" -eq 0 ] && [ -n "$shell_rc" ]; then
  touch "$shell_rc"
  if ! grep -Fq 'export PATH="$HOME/.local/bin:$PATH"' "$shell_rc"; then
    {
      echo ''
      echo '# tmux-demo-runner local CLI'
      echo 'export PATH="$HOME/.local/bin:$PATH"'
    } >>"$shell_rc"
  fi
fi

echo "Installed tmux-demo-runner CLI symlink:"
echo "  $bin_dir/tmux-demo-runner"
echo "Installed Vim plugin:"
echo "  $vim_package_dir/plugin/tmux-demo-runner.vim"
echo "Updated Vim mappings in:"
echo "  $vimrc"
if [ "$path_already_configured" -eq 0 ]; then
  if [ -n "$shell_rc" ]; then
    echo "Added ~/.local/bin to PATH in:"
    echo "  $shell_rc"
    echo "Restart your shell or run:"
    echo "  . $shell_rc"
  else
    echo "Add this to your shell startup file:"
    echo '  export PATH="$HOME/.local/bin:$PATH"'
  fi
fi
