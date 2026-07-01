// 集中导出所有模型
const database = require('./database');
const user = require('./user');
const session = require('./session');
const media = require('./media');
const todo = require('./todo');
const audit = require('./audit');
const activity = require('./activity');
const device = require('./device');
const borrow = require('./borrow');
const team = require('./team');
const profile = require('./profile');
const topicLibrary = require('./topic-library');
const settings = require('./settings');
const registrationRequest = require('./registration-request');
const feishuSync = require('./feishu-sync');

module.exports = {
  database,
  user,
  session,
  media,
  todo,
  audit,
  activity,
  device,
  borrow,
  team,
  profile,
  topicLibrary,
  settings,
  registrationRequest,
  feishuSync,
};
