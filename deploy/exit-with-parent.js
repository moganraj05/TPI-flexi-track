// Preloaded (node -r) into the backend and web processes started by
// start-all.js. On Windows, stopping a process does not stop the processes
// it started, so when the launcher is stopped (Task Scheduler "End", a
// restart, Ctrl+C) its children would otherwise keep running and keep
// holding ports 5000/8080. The launcher talks to each child over an IPC
// channel; when that channel closes, the launcher is gone, so exit too.
if (process.channel) {
  process.on('disconnect', () => process.exit(0));
  // Don't let the channel itself keep an otherwise finished process alive.
  process.channel.unref();
}
