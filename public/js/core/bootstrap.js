/**
 * 应用启动与登录编排
 *
 * 负责：Shell（展示页/登录/工作台）切换、登录表单与注册申请绑定、登录完成流程、
 * bootstrap 数据加载、首屏渲染编排，以及 DOM 就绪后的启动入口 init()。
 *
 * 面板挂载顺序很关键：登录成功后必须先 mountPanels() 将模板插入 DOM，
 * 再 clearDOMCache() 让 els 之前缓存的 null 失效，最后才渲染/绑定事件。
 */

import { state } from './state.js';
import { els, clearDOMCache } from './dom.js';
import { request, requestJSON } from '../utils/api.js';
import { Toast } from '../ui/toast.js';
import { setActiveView, setShellLoggedIn } from '../ui/navigation.js';
import { initMobileNav } from '../ui/mobile-nav.js';
import { setLoginPending } from '../ui/feedback.js';
import { initRippleEffects, initLazyLoading, loadingBar } from '../ui/loading.js';
import { loadShowcase } from '../modules/showcase.js';
import { ensureModulesLoaded } from './module-loader.js';
import { mountPanels } from './templates.js';
import { applyRoleVisibility, currentRole } from './router.js';
import { updateUserDisplay } from './profile.js';
import { bindAllEvents } from './events.js';
import {
  renderDashboard,
  renderMedia,
  renderReview,
  renderTodos,
  renderDevices,
  renderBorrowRequests,
  renderTeam,
  loadTeamContribution,
  renderTopics,
  renderSettings,
  renderSystemPanel,
  renderBorrowDeviceSelect,
  syncDeviceView,
  syncBorrowView,
  loadTopics,
} from './proxies.js';

function normalizeSessionPayload(payload) {
  const session = payload?.session || payload;
  if (!session) return { authenticated: false };
  return {
    ...session,
    authenticated: session.authenticated ?? Boolean(session.user),
  };
}

// ============================================================================
// Shell 切换
// ============================================================================
export function showShowcaseShell() {
  const showcase = document.getElementById('showcase-shell');
  const authShell = document.getElementById('auth-shell');
  const workspaceShell = document.getElementById('workspace-shell');
  if (showcase) showcase.classList.remove('hidden');
  if (authShell) authShell.classList.add('hidden');
  if (workspaceShell) workspaceShell.classList.add('hidden');
}

function showAuthShell() {
  const showcase = document.getElementById('showcase-shell');
  const authShell = document.getElementById('auth-shell');
  if (showcase) showcase.classList.add('hidden');
  if (authShell) authShell.classList.remove('hidden');
}

// ============================================================================
// 渲染所有视图
// ============================================================================
function renderAll() {
  if (!state.bootstrap) return;

  // 更新站点标题
  if (els.siteTitle) {
    els.siteTitle.textContent = state.bootstrap.site?.title || state.bootstrap.publicConfig?.siteTitle || '工作台';
  }
  if (els.homeHeroMessage) {
    els.homeHeroMessage.textContent = state.bootstrap.site?.homeHeroMessage || '这里显示管理员配置的首页说明。';
  }

  applyRoleVisibility();

  // 渲染所有模块
  renderDashboard();
  renderMedia();
  renderReview();
  renderTodos();
  renderDevices();
  renderBorrowRequests();
  renderTeam();
  loadTeamContribution();
  renderTopics();
  if (currentRole() === 'admin') {
    renderSettings();
    renderSystemPanel();
  }
  renderBorrowDeviceSelect();
}

// ============================================================================
// 数据加载
// ============================================================================
export async function loadBootstrap() {
  // 显示加载进度条
  loadingBar.start();

  try {
    // 业务模块和数据并行加载（首屏关键路径）
    // - import 各模块走 HTTP，能与 /api/bootstrap 并发，几乎零额外延迟
    // - bootstrap 数据返回前模块通常已就绪
    const [data] = await Promise.all([
      request('/api/bootstrap'),
      ensureModulesLoaded(),
    ]);

    // 先挂载面板模板，再让 els 缓存失效，确保后续 render/绑定能命中新节点
    await mountPanels();
    clearDOMCache();

    state.bootstrap = data;
    state.deviceCatalog = Array.isArray(data.devices) ? data.devices : [];
    state.borrowCatalog = Array.isArray(data.borrowRequests) ? data.borrowRequests : [];
    syncDeviceView();
    syncBorrowView();
    await loadTopics();
    renderAll();

    // 完成加载
    loadingBar.finish();
  } catch (error) {
    // 加载失败
    loadingBar.error();
    throw error;
  }
}

// ============================================================================
// 登录处理
// ============================================================================
async function completeLogin(result, message) {
  Toast.success(message);
  state.session = normalizeSessionPayload(result);

  await loadBootstrap();

  const showcase = document.getElementById('showcase-shell');
  if (showcase) showcase.classList.add('hidden');
  setShellLoggedIn(true);
  updateUserDisplay();
  bindAllEvents();
  renderAll();
  setActiveView(state.activeView);
}

function bindLoginForm() {
  if (!els.loginForm) return;

  // 密码显示/隐藏切换按钮
  const passwordToggle = document.getElementById('login-password-toggle');
  const passwordInput = document.getElementById('login-password');

  if (passwordToggle && passwordInput) {
    passwordToggle.addEventListener('click', (e) => {
      e.preventDefault();
      const isPressed = passwordToggle.getAttribute('aria-pressed') === 'true';
      passwordToggle.setAttribute('aria-pressed', String(!isPressed));
      passwordInput.type = isPressed ? 'password' : 'text';
      passwordToggle.setAttribute('aria-label', isPressed ? '显示密码' : '隐藏密码');
    });
  }

  // Caps Lock 检测
  if (passwordInput) {
    const capsLockHint = document.getElementById('caps-lock-hint');
    if (capsLockHint) {
      passwordInput.addEventListener('keyup', (e) => {
        capsLockHint.hidden = !(typeof e.getModifierState === 'function' && e.getModifierState('CapsLock'));
      });
    }
  }

  if (els.loginGuest) {
    els.loginGuest.addEventListener('click', async () => {
      try {
        setLoginPending(true);
        const result = await requestJSON('/api/login/guest', { method: 'POST' });

        if (result.success || result.session || result.authenticated) {
          await completeLogin(result, '已以访客身份进入');
        } else {
          Toast.error(result.message || '访客进入失败');
        }
      } catch (error) {
        console.error('访客进入失败:', error);
        Toast.error(error.message || '访客进入失败');
      } finally {
        setLoginPending(false);
      }
    });
  }

  if (els.registrationToggle && els.registrationForm) {
    els.registrationToggle.addEventListener('click', () => {
      const shouldShow = els.registrationForm.classList.contains('hidden');
      els.registrationForm.classList.toggle('hidden', !shouldShow);
      els.registrationToggle.setAttribute('aria-expanded', String(shouldShow));
      if (shouldShow) {
        els.registrationForm.querySelector('input, textarea, button')?.focus();
      }
    });

    els.registrationSubmit?.addEventListener('click', async () => {
      const fields = [...els.registrationForm.querySelectorAll('input, textarea')];
      const invalidField = fields.find((field) => !field.checkValidity());
      if (invalidField) {
        invalidField.reportValidity();
        return;
      }

      const body = fields.reduce((data, field) => {
        data[field.name] = field.value.trim();
        return data;
      }, {});

      try {
        els.registrationSubmit.disabled = true;
        const result = await requestJSON('/api/registration-requests', {
          method: 'POST',
          body,
        });

        if (result.ok) {
          fields.forEach((field) => {
            field.value = '';
          });
          els.registrationForm.classList.add('hidden');
          els.registrationToggle.setAttribute('aria-expanded', 'false');
          Toast.success('申请已提交，请等待管理员审核');
        } else {
          Toast.error(result.message || '提交申请失败');
        }
      } catch (error) {
        console.error('提交注册申请失败:', error);
        Toast.error(error.message || '提交申请失败');
      } finally {
        els.registrationSubmit.disabled = false;
      }
    });
  }

  // 登录表单提交
  els.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(els.loginForm);
    const username = formData.get('username');
    const password = formData.get('password');

    if (!username || !password) {
      Toast.warning('请输入用户名和密码');
      return;
    }

    try {
      setLoginPending(true);

      const result = await requestJSON('/api/login', {
        method: 'POST',
        body: { username, password }
      });

      if (result.success || result.session || result.authenticated) {
        await completeLogin(result, '登录成功');
      } else {
        Toast.error(result.message || '登录失败');
      }
    } catch (error) {
      console.error('登录失败:', error);
      Toast.error(error.message || '登录失败');
    } finally {
      setLoginPending(false);
    }
  });
}

// ============================================================================
// 应用启动
// ============================================================================
async function start() {
  try {
    console.log('📦 加载会话数据...');

    const sessionData = await request('/api/session').catch(() => null);
    state.session = normalizeSessionPayload(sessionData);

    if (state.session?.user) {
      console.log('✅ 用户已登录:', state.session.user.username);

      await loadBootstrap();

      const showcase = document.getElementById('showcase-shell');
      if (showcase) showcase.classList.add('hidden');
      setShellLoggedIn(true);
      updateUserDisplay();
      bindAllEvents();
      setActiveView(state.activeView);

      Toast.success('欢迎回来，' + state.session.user.username);
    } else {
      console.log('ℹ️ 用户未登录，显示展示页');
      showShowcaseShell();
      loadShowcase();
    }
  } catch (error) {
    console.error('❌ 启动失败:', error);
    Toast.error('应用启动失败');
    showShowcaseShell();
    loadShowcase();
  }
}

/**
 * 启动绑定入口：登录表单、移动端导航、展示页入口按钮，并触发 start()。
 * 由 app-modular.js 薄壳在 DOM 就绪后调用。
 */
export function init() {
  bindLoginForm();
  initMobileNav();

  // 绑定展示页入口按钮
  const showcaseToLogin = document.getElementById('showcase-to-login');
  if (showcaseToLogin) {
    showcaseToLogin.addEventListener('click', () => {
      showAuthShell();
    });
  }

  start();

  // 初始化 UX 增强功能
  setTimeout(() => {
    initRippleEffects();
    initLazyLoading();
    console.log('✨ UX 增强功能已初始化');
  }, 500);
}

