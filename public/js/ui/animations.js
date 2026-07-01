/**
 * UI 动效工具
 *
 * - animateCountUp(el, target, duration)：数字 0 → target 滚动
 * - runDashboardCountUpOnce()：登录后/刷新后首次运行 metric count-up，仅一次
 * - flashSuccess(btn)：在按钮上闪 checkmark + success-glow
 * - applyDayPhase()：根据本地时钟把 dawn/day/dusk/night 写到 body[data-day-phase]
 * - triggerHeroCleared()：当日首次「待审 + 待办 = 0」时触发 hero 能量条扫过
 *
 * 全部 vanilla，无依赖。所有动画走 transform/opacity，
 * prefers-reduced-motion 由 CSS 兜底失活。
 */

// ─────────────────────────────────────────────────────────────────────────────
// Count-up
// ─────────────────────────────────────────────────────────────────────────────

const numericRe = /^-?\d[\d,]*(\.\d+)?$/;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function animateCountUp(el, target, duration = 600) {
  if (!el) return;
  const targetNum = Number(String(target).replace(/,/g, ''));
  if (!Number.isFinite(targetNum)) return;
  const start = performance.now();
  const decimals = String(target).includes('.') ? 1 : 0;
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const v = targetNum * easeOutCubic(t);
    el.textContent = decimals ? v.toFixed(decimals) : Math.round(v).toString();
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = String(target);
  }
  requestAnimationFrame(tick);
}

let didDashboardCountUp = false;

export function runDashboardCountUpOnce() {
  if (didDashboardCountUp) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    didDashboardCountUp = true;
    return;
  }
  const nums = document.querySelectorAll('#dashboard-stats .metric-num');
  if (!nums.length) return;
  let triggered = false;
  nums.forEach((el) => {
    const raw = (el.textContent || '').trim();
    if (!numericRe.test(raw)) return;
    el.dataset.target = raw;
    el.textContent = '0';
    animateCountUp(el, raw, 600);
    triggered = true;
  });
  if (triggered) didDashboardCountUp = true;
}

export function resetDashboardCountUpFlag() {
  didDashboardCountUp = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Flash success（按钮勾路径 + 柔光）
// ─────────────────────────────────────────────────────────────────────────────

const CHECK_SVG = '<svg class="btn-check" viewBox="0 0 16 16" aria-hidden="true"><polyline points="3 9 7 13 13 5"></polyline></svg>';

export function flashSuccess(btn) {
  if (!btn) return;
  if (!btn.querySelector(':scope > .btn-check')) {
    btn.insertAdjacentHTML('beforeend', CHECK_SVG);
  }
  // 重置以便重复触发
  btn.classList.remove('is-success');
  // 强制 reflow
  void btn.offsetWidth;
  btn.classList.add('is-success');
  window.setTimeout(() => {
    btn.classList.remove('is-success');
  }, 900);
}

// ─────────────────────────────────────────────────────────────────────────────
// Day phase（hero 时段彩色鲁出）
// ─────────────────────────────────────────────────────────────────────────────

function pickDayPhase(hour) {
  if (hour >= 5 && hour < 11) return 'dawn';
  if (hour >= 11 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19) return 'dusk';
  return 'night';
}

export function applyDayPhase() {
  const phase = pickDayPhase(new Date().getHours());
  if (document.body.dataset.dayPhase !== phase) {
    document.body.dataset.dayPhase = phase;
  }
}

let dayPhaseTimer = null;

export function startDayPhaseWatcher() {
  applyDayPhase();
  if (dayPhaseTimer) window.clearInterval(dayPhaseTimer);
  dayPhaseTimer = window.setInterval(applyDayPhase, 15 * 60 * 1000);
}

export function stopDayPhaseWatcher() {
  if (dayPhaseTimer) {
    window.clearInterval(dayPhaseTimer);
    dayPhaseTimer = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero「今日清零」能量条扫过
// ─────────────────────────────────────────────────────────────────────────────

const CLEARED_KEY_PREFIX = 'shengsheng.cleared.';

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function triggerHeroCleared({ pendingReview = 0, todoOpen = 0 } = {}) {
  if (pendingReview !== 0 || todoOpen !== 0) return;
  const card = document.querySelector('.overview-hero-card');
  if (!card) return;

  let storage = null;
  try { storage = window.localStorage; } catch {}
  const key = CLEARED_KEY_PREFIX + todayKey();
  if (storage && storage.getItem(key)) return;

  card.classList.remove('is-cleared');
  void card.offsetWidth;
  card.classList.add('is-cleared');

  const onEnd = () => {
    card.classList.remove('is-cleared');
    card.removeEventListener('animationend', onEnd);
  };
  card.addEventListener('animationend', onEnd);

  if (storage) {
    try { storage.setItem(key, '1'); } catch {}
  }
}
