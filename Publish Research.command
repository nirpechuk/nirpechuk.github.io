#!/bin/zsh
cd "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
node bin/research/cli.mjs --choose --push
printf '\nPress Return to close.'
read
