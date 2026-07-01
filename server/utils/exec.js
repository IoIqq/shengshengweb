/**
 * 安全命令执行器
 *
 * 仿 transfer.js 的 robocopyFile 模式：spawn + args 数组（非 shell 字符串），
 * 杜绝命令注入。捕获 stdout/stderr，超时自动 kill。
 */
const { spawn } = require('child_process');

/**
 * 执行命令并返回结果
 * @param {string} cmd 可执行文件名（如 'wmic'、'sc'、'shutdown'、'netsh'）
 * @param {string[]} args 参数数组（不经过 shell，防注入）
 * @param {{timeout?: number, cwd?: string, maxBuffer?: number}} [options]
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
function runCommand(cmd, args = [], options = {}) {
  const { timeout = 15000, cwd, maxBuffer = 2 * 1024 * 1024, ignoreExitCode = false } = options;
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let killed = false;
    let timer = null;

    const child = spawn(cmd, args, { windowsHide: true, cwd });

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > maxBuffer) { killed = true; try { child.kill(); } catch (_) {} }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > maxBuffer) { killed = true; try { child.kill(); } catch (_) {} }
    });

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(new Error(`无法执行 "${cmd}": ${err.message}`));
    });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (killed) {
        return reject(new Error(`输出超出 ${maxBuffer} 字节上限，已终止。`));
      }
      if (code === 0 || code === null) {
        resolve({ stdout, stderr, code: code ?? 0 });
      } else if (ignoreExitCode) {
        // 调用方自行按退出码/输出判定成败（如 sc.exe 用退出码+文本双重表达失败）
        resolve({ stdout, stderr, code });
      } else {
        const tip = stderr.trim() || stdout.trim();
        reject(new Error(`"${cmd}" 退出码 ${code}${tip ? ': ' + tip.slice(0, 500) : ''}`));
      }
    });

    if (timeout > 0) {
      timer = setTimeout(() => {
        killed = true;
        try { child.kill('SIGTERM'); } catch (_) {}
        reject(new Error(`"${cmd}" 超时 (${timeout}ms)`));
      }, timeout);
    }
  });
}

module.exports = { runCommand };
