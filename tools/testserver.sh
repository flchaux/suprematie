#!/bin/bash
# (Re)lance un serveur de test local sur le port 3061 (code d'accès : testkey).
PIDF=/tmp/claude-1000/supreme-testserver.pid
mkdir -p /tmp/claude-1000
if [ -f $PIDF ]; then kill $(cat $PIDF) 2>/dev/null; sleep 0.5; fi
cd "$(dirname "$0")/.."
PORT=3061 SUPREME_KEY=testkey SUPREME_DATA=/tmp/claude-1000/supreme-testdata nohup node packages/server/src/main.ts > /tmp/claude-1000/supreme-testserver.log 2>&1 &
echo $! > $PIDF
sleep 1.2
