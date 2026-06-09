const { all, get, run, saveDatabase } = require('./database');
const { nowIso } = require('../utils');

function topicRowToItem(row) {
  if (!row) return null;
  let tags = [];
  try { tags = JSON.parse(row.tags_json || '[]'); } catch (e) { /* keep default */ }
  return {
    id: row.id,
    title: row.title,
    sourceUrl: row.source_url,
    sourceHost: row.source_host || '',
    sourcePlatform: row.source_platform || 'other',
    embedUrl: row.embed_url || '',
    thumbnailUrl: row.thumbnail_url || '',
    description: row.description || '',
    tags,
    status: row.status || 'idea',
    createdBy: row.created_by || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getTopicList() {
  const rows = all('SELECT * FROM topic_library ORDER BY updated_at DESC');
  return rows.map(topicRowToItem);
}

function getTopicById(id) {
  const row = get('SELECT * FROM topic_library WHERE id = ?', [id]);
  return topicRowToItem(row);
}

function createTopic(data) {
  const now = nowIso();
  const tagsJson = JSON.stringify(
    (Array.isArray(data.tags) ? data.tags : String(data.tags || '').split(',').map(s => s.trim()).filter(Boolean)).slice(0, 10)
  );
  run(
    `INSERT INTO topic_library (id, title, source_url, source_host, source_platform, embed_url, thumbnail_url, description, tags_json, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.id, data.title, data.sourceUrl || data.source_url || '',
      data.sourceHost || data.source_host || '', data.sourcePlatform || data.source_platform || 'other',
      data.embedUrl || data.embed_url || '', data.thumbnailUrl || data.thumbnail_url || '',
      data.description || '', tagsJson, data.status || 'idea',
      data.createdBy || data.created_by || '', now, now,
    ]
  );
  saveDatabase();
  return getTopicById(data.id);
}

function updateTopic(id, updates) {
  const now = nowIso();
  const fields = [];
  const values = [];

  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.sourceUrl !== undefined || updates.source_url !== undefined) {
    fields.push('source_url = ?');
    values.push(updates.sourceUrl ?? updates.source_url);
  }
  if (updates.sourceHost !== undefined || updates.source_host !== undefined) {
    fields.push('source_host = ?');
    values.push(updates.sourceHost ?? updates.source_host ?? '');
  }
  if (updates.sourcePlatform !== undefined || updates.source_platform !== undefined) {
    fields.push('source_platform = ?');
    values.push(updates.sourcePlatform ?? updates.source_platform ?? 'other');
  }
  if (updates.embedUrl !== undefined || updates.embed_url !== undefined) {
    fields.push('embed_url = ?');
    values.push(updates.embedUrl ?? updates.embed_url ?? '');
  }
  if (updates.thumbnailUrl !== undefined || updates.thumbnail_url !== undefined) {
    fields.push('thumbnail_url = ?');
    values.push(updates.thumbnailUrl ?? updates.thumbnail_url ?? '');
  }
  if (updates.description !== undefined) {
    fields.push('description = ?'); values.push(updates.description);
  }
  if (updates.tags !== undefined) {
    fields.push('tags_json = ?');
    const tagsJson = JSON.stringify(
      (Array.isArray(updates.tags) ? updates.tags : String(updates.tags).split(',').map(s => s.trim()).filter(Boolean)).slice(0, 10)
    );
    values.push(tagsJson);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?'); values.push(updates.status);
  }
  if (updates.createdBy !== undefined || updates.created_by !== undefined) {
    fields.push('created_by = ?');
    values.push(updates.createdBy ?? updates.created_by ?? '');
  }

  if (fields.length === 0) return getTopicById(id);

  fields.push('updated_at = ?');
  values.push(now);
  values.push(id);

  run(`UPDATE topic_library SET ${fields.join(', ')} WHERE id = ?`, values);
  saveDatabase();
  return getTopicById(id);
}

function deleteTopic(id) {
  const exists = getTopicById(id);
  if (!exists) return false;
  run('DELETE FROM topic_library WHERE id = ?', [id]);
  saveDatabase();
  return true;
}

module.exports = { getTopicList, getTopicById, createTopic, updateTopic, deleteTopic };
