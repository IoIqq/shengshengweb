/**
 * 业务模块方法代理
 *
 * 在 ensureModulesLoaded() 完成前调用这些代理 → 静默 no-op；
 * 加载完成后 → 转发到真实模块方法。统一从 module-loader 的 getModules() 取实例，
 * 避免入口层直接依赖具体业务模块，便于路由级懒加载。
 */

import { getModules } from './module-loader.js';

const m = () => getModules();

// dashboard
export const renderDashboard = (...args) => m()?.dashboard?.renderDashboard?.(...args);
export const renderActivity = (...args) => m()?.dashboard?.renderActivity?.(...args);
export const initActivityFilters = (...args) => m()?.dashboard?.initActivityFilters?.(...args);

// media
export const renderMedia = (...args) => m()?.media?.renderMedia?.(...args);
export const renderReview = (...args) => m()?.media?.renderReview?.(...args);
export const reviewMedia = (...args) => m()?.media?.reviewMedia?.(...args);
export const deleteMedia = (...args) => m()?.media?.deleteMedia?.(...args);
export const toggleMediaSelection = (...args) => m()?.media?.toggleMediaSelection?.(...args);
export const clearMediaSelection = (...args) => m()?.media?.clearMediaSelection?.(...args);
export const batchReviewMedia = (...args) => m()?.media?.batchReviewMedia?.(...args);
export const initUploadDialog = (...args) => m()?.media?.initUploadDialog?.(...args);
export const openUploadDialog = (...args) => m()?.media?.openUploadDialog?.(...args);

// todo
export const renderTodos = (...args) => m()?.todo?.renderTodos?.(...args);
export const createTodo = (...args) => m()?.todo?.createTodo?.(...args);
export const toggleTodo = (...args) => m()?.todo?.toggleTodo?.(...args);
export const deleteTodo = (...args) => m()?.todo?.deleteTodo?.(...args);
export const startEditTodo = (...args) => m()?.todo?.startEditTodo?.(...args);
export const cancelEditTodo = (...args) => m()?.todo?.cancelEditTodo?.(...args);
export const saveEditTodo = (...args) => m()?.todo?.saveEditTodo?.(...args);

// team
export const renderTeam = (...args) => m()?.team?.renderTeam?.(...args);
export const createTeamMember = (...args) => m()?.team?.createTeamMember?.(...args);
export const deleteTeamMember = (...args) => m()?.team?.deleteTeamMember?.(...args);
export const moveTeamMember = (...args) => m()?.team?.moveTeamMember?.(...args);
export const startEditTeamMember = (...args) => m()?.team?.startEditTeamMember?.(...args);
export const cancelEditTeamMember = (...args) => m()?.team?.cancelEditTeamMember?.(...args);
export const saveEditTeamMember = (...args) => m()?.team?.saveEditTeamMember?.(...args);
export const loadTeamContribution = (...args) => m()?.team?.loadTeamContribution?.(...args);

// topics
export const renderTopics = (...args) => m()?.topics?.renderTopics?.(...args);
export const loadTopics = (...args) => m()?.topics?.loadTopics?.(...args);
export const addTopic = (...args) => m()?.topics?.addTopic?.(...args);
export const updateTopic = (...args) => m()?.topics?.updateTopic?.(...args);
export const deleteTopic = (...args) => m()?.topics?.deleteTopic?.(...args);
export const renderTopicsPreview = (...args) => m()?.topics?.renderTopicPreview?.(...args);
export const bindTopicsEvents = (...args) => m()?.topics?.bindTopicsEvents?.(...args);

// device
export const renderDevices = (...args) => m()?.device?.renderDevices?.(...args);
export const createDevice = (...args) => m()?.device?.createDevice?.(...args);
export const updateDevice = (...args) => m()?.device?.updateDevice?.(...args);
export const deleteDevice = (...args) => m()?.device?.deleteDevice?.(...args);
export const startEditDevice = (...args) => m()?.device?.startEditDevice?.(...args);
export const cancelEditDevice = (...args) => m()?.device?.cancelEditDevice?.(...args);
export const setDeviceImagePreview = (...args) => m()?.device?.setDeviceImagePreview?.(...args);
export const uploadDeviceImage = (...args) => m()?.device?.uploadDeviceImage?.(...args);
export const loadDeviceOptions = (...args) => m()?.device?.loadDeviceOptions?.(...args);
export const syncDeviceView = (...args) => m()?.device?.syncDeviceView?.(...args);
export const refreshDevices = (...args) => m()?.device?.refreshDevices?.(...args);

// borrow
export const renderBorrowRequests = (...args) => m()?.borrow?.renderBorrowRequests?.(...args);
export const createBorrowRequest = (...args) => m()?.borrow?.createBorrowRequest?.(...args);
export const approveBorrowRequest = (...args) => m()?.borrow?.approveBorrowRequest?.(...args);
export const returnBorrowRequest = (...args) => m()?.borrow?.returnBorrowRequest?.(...args);
export const deleteBorrowRequest = (...args) => m()?.borrow?.deleteBorrowRequest?.(...args);
export const syncBorrowView = (...args) => m()?.borrow?.syncBorrowView?.(...args);
export const refreshBorrowRequests = (...args) => m()?.borrow?.refreshBorrowRequests?.(...args);
export const renderBorrowDeviceSelect = (...args) => m()?.borrow?.renderBorrowDeviceSelect?.(...args);

// settings
export const renderSettings = (...args) => m()?.settings?.renderSettings?.(...args);
export const updateSettings = (...args) => m()?.settings?.updateSettings?.(...args);
export const copyToClipboard = (...args) => m()?.settings?.copyToClipboard?.(...args);

// users / audit / storage / wishWall
export const initUsers = (...args) => m()?.users?.initUsers?.(...args);
export const loadUsers = (...args) => m()?.users?.loadUsers?.(...args);
export const initAuditLogs = (...args) => m()?.audit?.initAuditLogs?.(...args);
export const loadAuditLogs = (...args) => m()?.audit?.loadAuditLogs?.(...args);
export const loadStorageStatus = (...args) => m()?.storage?.loadStorageStatus?.(...args);
export const bindStorageEvents = (...args) => m()?.storage?.bindStorageEvents?.(...args);
export const initWishWall = (...args) => m()?.wishWall?.initWishWall?.(...args);
