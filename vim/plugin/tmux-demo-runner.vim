if exists('g:loaded_tmux_demo_runner')
  finish
endif
let g:loaded_tmux_demo_runner = 1

if !exists('g:tmux_demo_runner_command')
  let g:tmux_demo_runner_command = 'tmux-demo-runner'
endif

if !exists('g:tmux_demo_runner_tmux_pane')
  let g:tmux_demo_runner_tmux_pane = ''
endif

function! s:ShellArgs(args) abort
  return join(map(copy(a:args), 'shellescape(v:val)'), ' ')
endfunction

function! s:RunnerArgs() abort
  let l:args = []
  if g:tmux_demo_runner_tmux_pane !=# ''
    call add(l:args, '--tmux-pane')
    call add(l:args, g:tmux_demo_runner_tmux_pane)
  endif
  return l:args
endfunction

function! s:Run(command, start_line, end_line) abort
  if expand('%:p') ==# ''
    echoerr 'tmux Demo Runner: save the demo file before running it'
    return
  endif

  let l:args = [g:tmux_demo_runner_command, a:command, expand('%:p')]
  if a:start_line ==# a:end_line && a:command !~# '-range$'
    call add(l:args, string(a:start_line))
  else
    call add(l:args, string(a:start_line))
    call add(l:args, string(a:end_line))
  endif
  call extend(l:args, s:RunnerArgs())

  let l:output = system(s:ShellArgs(l:args))
  if v:shell_error
    echoerr l:output
    return
  endif

  if l:output !=# ''
    echom l:output
  endif

  if a:command =~# '^run-'
    call cursor(min([a:end_line + 1, line('$')]), 1)
  endif
endfunction

function! TmuxDemoRunnerRunNext() abort
  call s:Run('run-line', line('.'), line('.'))
endfunction

function! TmuxDemoRunnerRunRange(start_line, end_line) abort
  call s:Run('run-range', a:start_line, a:end_line)
endfunction

function! TmuxDemoRunnerPasteLine() abort
  call s:Run('paste-line', line('.'), line('.'))
endfunction

function! TmuxDemoRunnerPasteRange(start_line, end_line) abort
  call s:Run('paste-range', a:start_line, a:end_line)
endfunction

command! TmuxDemoRunnerRunNext call TmuxDemoRunnerRunNext()
command! -range TmuxDemoRunnerRunRange call TmuxDemoRunnerRunRange(<line1>, <line2>)
command! TmuxDemoRunnerPasteLine call TmuxDemoRunnerPasteLine()
command! -range TmuxDemoRunnerPasteRange call TmuxDemoRunnerPasteRange(<line1>, <line2>)

nnoremap <silent> <Plug>(TmuxDemoRunnerRunNext) :TmuxDemoRunnerRunNext<CR>
xnoremap <silent> <Plug>(TmuxDemoRunnerRunRange) :TmuxDemoRunnerRunRange<CR>
nnoremap <silent> <Plug>(TmuxDemoRunnerPasteLine) :TmuxDemoRunnerPasteLine<CR>
xnoremap <silent> <Plug>(TmuxDemoRunnerPasteRange) :TmuxDemoRunnerPasteRange<CR>
