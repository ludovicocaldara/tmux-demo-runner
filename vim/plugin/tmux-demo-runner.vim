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

if !exists('g:tmux_demo_runner_input_cache')
  let g:tmux_demo_runner_input_cache = {}
endif

function! s:ShellArgs(args) abort
  return join(map(copy(a:args), 'shellescape(v:val)'), ' ')
endfunction

function! s:RunnerArgs(input_values) abort
  let l:args = []
  if g:tmux_demo_runner_tmux_pane !=# ''
    call add(l:args, '--tmux-pane')
    call add(l:args, g:tmux_demo_runner_tmux_pane)
  endif
  for l:name in sort(keys(a:input_values))
    call add(l:args, '--input')
    call add(l:args, l:name . '=' . a:input_values[l:name])
  endfor
  return l:args
endfunction

function! s:Trim(value) abort
  return substitute(a:value, '^\s*\|\s*$', '', 'g')
endfunction

function! s:UnquoteDirectiveValue(value) abort
  let l:value = s:Trim(a:value)
  if l:value =~# '^".*"$'
    return substitute(l:value[1:-2], '\\"', '"', 'g')
  endif
  if l:value =~# "^'.*'$"
    return substitute(l:value[1:-2], "\\\\'", "'", 'g')
  endif
  return l:value
endfunction

function! s:InputNames(line) abort
  let l:names = []
  let l:start = 0
  let l:pattern = '\(^\|[^\\]\){{\s*input:\s*\zs[^}]\{-}\ze\s*}}'

  while 1
    let l:name = matchstr(a:line, l:pattern, l:start)
    if l:name ==# ''
      break
    endif
    call add(l:names, s:Trim(l:name))
    let l:match_end = matchend(a:line, l:pattern, l:start)
    if l:match_end < 0
      break
    endif
    let l:start = l:match_end
  endwhile

  return l:names
endfunction

function! s:IsSecretInput(name) abort
  return a:name =~? 'password\|passwd\|secret\|token\|key'
endfunction

function! s:PromptInput(name) abort
  let l:prompt = 'tmux Demo Runner value for ' . a:name . ': '
  if s:IsSecretInput(a:name)
    return inputsecret(l:prompt)
  endif
  return input(l:prompt)
endfunction

function! s:PrepareInputs(lines) abort
  let l:input_values = {}

  for l:line in a:lines
    let l:clear_match = matchlist(l:line, '^---#\s*tmux-demo-runner\s\+clearInput\%(\s\+\(\S\+\)\)\?\s*$')
    if !empty(l:clear_match)
      if l:clear_match[1] ==# ''
        let g:tmux_demo_runner_input_cache = {}
      elseif has_key(g:tmux_demo_runner_input_cache, l:clear_match[1])
        call remove(g:tmux_demo_runner_input_cache, l:clear_match[1])
      endif
      continue
    endif

    let l:set_match = matchlist(l:line, '^---#\s*tmux-demo-runner\s\+setInput\s\+\(\S\+\)\s\+\(.*\)$')
    if !empty(l:set_match)
      let g:tmux_demo_runner_input_cache[l:set_match[1]] = s:UnquoteDirectiveValue(l:set_match[2])
      continue
    endif

    for l:name in s:InputNames(l:line)
      if l:name ==# ''
        continue
      endif
      if !has_key(g:tmux_demo_runner_input_cache, l:name)
        let g:tmux_demo_runner_input_cache[l:name] = s:PromptInput(l:name)
      endif
      let l:input_values[l:name] = g:tmux_demo_runner_input_cache[l:name]
    endfor
  endfor

  return l:input_values
endfunction

function! s:Run(command, start_line, end_line) abort
  if expand('%:p') ==# ''
    echoerr 'tmux Demo Runner: save the demo file before running it'
    return
  endif
  if &modified
    echoerr 'tmux Demo Runner: save the demo file before running it'
    return
  endif

  let l:lines = getline(a:start_line, a:end_line)
  let l:input_values = s:PrepareInputs(l:lines)
  let l:args = [g:tmux_demo_runner_command, a:command, expand('%:p')]
  if a:start_line ==# a:end_line && a:command !~# '-range$'
    call add(l:args, string(a:start_line))
  else
    call add(l:args, string(a:start_line))
    call add(l:args, string(a:end_line))
  endif
  call extend(l:args, s:RunnerArgs(l:input_values))

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
