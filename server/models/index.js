// 集中导出所有模型
const database = require('./database');
const user = require('./user');
const session = require('./session');
const media = require('./media');
const todo = require('./todo');
const audit = require('./audit');
const device = require('./device');
const borrow = require('./borrow');
const team = require('./team');
const profile = require('./profile');

module.exports = {
  database,
  user,
  session,
  media,
  todo,
  audit,
  device,
  borrow,
  team,
  profile
};
