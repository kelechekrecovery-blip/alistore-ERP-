import { spawn } from 'node:child_process';

const TERMINATION_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/** Run a deploy helper in its own process group and hard-stop the whole group at the deadline. */
export function runBoundedCommand(command, args, {
  cwd = process.cwd(),
  env = process.env,
  timeoutMs,
} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Command timeout must be a positive integer');
  }

  return new Promise((resolve, reject) => {
    const usesProcessGroup = process.platform !== 'win32';
    const child = spawn(command, args, {
      cwd,
      env,
      detached: usesProcessGroup,
      shell: false,
      stdio: 'inherit',
    });
    let settled = false;
    let timedOut = false;
    let interruptedSignal;
    let timer;
    const signalHandlers = new Map();

    const removeProcessHandlers = () => {
      for (const [signal, handler] of signalHandlers) process.off(signal, handler);
      signalHandlers.clear();
      process.off('exit', exitHandler);
    };
    const killChildGroup = () => {
      if (usesProcessGroup && child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
          return;
        } catch (groupError) {
          if (child.kill('SIGKILL') || child.exitCode !== null) return;
          throw groupError;
        }
      }
      if (!child.kill('SIGKILL') && child.exitCode === null) {
        throw new Error(`Unable to stop ${command}`);
      }
    };
    const exitHandler = () => {
      if (settled) return;
      try {
        killChildGroup();
      } catch {
        // Exit handlers cannot defer termination; the database idle-session
        // deadline remains the final server-side fence-release backstop.
      }
    };
    process.once('exit', exitHandler);

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      removeProcessHandlers();
      if (interruptedSignal) {
        process.kill(process.pid, interruptedSignal);
        return;
      }
      if (error) reject(error);
      else resolve();
    };

    for (const signal of TERMINATION_SIGNALS) {
      const handler = () => {
        if (interruptedSignal) return;
        interruptedSignal = signal;
        clearTimeout(timer);
        try {
          killChildGroup();
        } catch (error) {
          finish(new Error(`${command} was interrupted but its child group could not be stopped`, {
            cause: error,
          }));
        }
      };
      signalHandlers.set(signal, handler);
      process.once(signal, handler);
    }

    timer = setTimeout(() => {
      timedOut = true;
      try {
        killChildGroup();
      } catch (error) {
        finish(new Error(`${command} exceeded its ${timeoutMs}ms deadline and could not be stopped`, {
          cause: error,
        }));
      }
    }, timeoutMs);

    child.once('error', (error) => {
      finish(new Error(`${command} could not be started`, { cause: error }));
    });
    child.once('close', (code, signal) => {
      if (timedOut) {
        finish(new Error(`${command} exceeded its ${timeoutMs}ms deadline`));
      } else if (code !== 0) {
        finish(new Error(`${command} failed with exit ${code ?? signal ?? 1}`));
      } else {
        finish();
      }
    });
  });
}
