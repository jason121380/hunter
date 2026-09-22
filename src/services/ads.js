import { metaGetAll } from './meta.js';
import { httpError } from '../errors.js';
import { requireMetaAccountId, requireMetaObjectId, requireMetaObjectIdList, requireDateRange } from '../validate.js';
import { detectCampaignType, resolveTrafficResult, buildMessageReport, buildTrafficReport } from './reports.js';

const INSIGHT_FIELDS = [
  'campaign_id','campaign_name','adset_id','adset_name','spend','impressions','clicks','ctr',
  'actions','cost_per_action_type','results','cost_per_result'
].join(',');

const CAMPAIGN_CACHE_TTL_MS = 60 * 1000;
const CAMPAIGN_CACHE_MAX = 500;
const campaignCache = new Map();

function typeLabel(type) {
  if (type === 'message') return '私訊型廣告';
  if (type === 'traffic') return '流量型廣告';
  return '其他';
}

async function fetchActiveCampaigns(accountId) {
  const rows = await metaGetAll(`${accountId}/campaigns`, {
    fields: 'id,name,status,effective_status,created_time',
    effective_status: JSON.stringify(['ACTIVE']),
    limit: 500,
  });
  return rows
    .filter(x => x.effective_status === 'ACTIVE')
    .map(x => {
      const type = detectCampaignType(x.name);
      return {
        id: String(x.id),
        name: x.name || '',
        type,
        typeLabel: typeLabel(type),
        createdTime: x.created_time || '',
      };
    })
    .filter(x => x.type !== 'other');
}

// 報表與廣告清單用：60 秒短快取，確保回報內容接近即時。
export async function activeCampaigns(accountId, { force = false } = {}) {
  const id = requireMetaAccountId(accountId);
  const now = Date.now();
  const cached = campaignCache.get(id);
  if (!force && cached && cached.expiresAt > now) return cached.value;

  const value = await fetchActiveCampaigns(id);

  if (campaignCache.size >= CAMPAIGN_CACHE_MAX) campaignCache.clear();
  campaignCache.set(id, { value, expiresAt: Date.now() + CAMPAIGN_CACHE_TTL_MS });
  return value;
}

// ── 首頁「進行中廣告數」專用快取 ─────────────────────────────
// 首頁要一次算出所有帳號的廣告數，逐一打 Graph API 很慢，所以另外用較長的快取：
//   10 分鐘內        → 直接用快取
//   10 分鐘 ～ 6 小時 → 先回傳舊值，同時在背景更新（stale-while-revalidate）
//   超過 6 小時       → 等待重新抓取
// 這個快取只影響首頁顯示的數字，不影響報表：報表走上面 60 秒的 activeCampaigns()。
const COUNTS_FRESH_MS = 10 * 60 * 1000;
const COUNTS_MAX_STALE_MS = 6 * 60 * 60 * 1000;
// 使用者按「重新整理」會略過快取，但同一帳號 30 秒內只重抓一次，避免連按打爆 Meta 限流。
const COUNTS_FORCE_MIN_AGE_MS = 30 * 1000;
const countsCache = new Map();
const countsInflight = new Map();

function summarize(campaigns) {
  const message = campaigns.filter(x => x.type === 'message').length;
  const traffic = campaigns.filter(x => x.type === 'traffic').length;
  return { message, traffic, total: message + traffic };
}

function refreshCounts(id) {
  if (countsInflight.has(id)) return countsInflight.get(id);

  const started = Date.now();
  const promise = activeCampaigns(id, { force: true })
    .then(campaigns => {
      const entry = { value: summarize(campaigns), fetchedAt: Date.now() };
      if (countsCache.size >= CAMPAIGN_CACHE_MAX) countsCache.clear();
      countsCache.set(id, entry);
      return { ...entry, ms: Date.now() - started };
    })
    .finally(() => countsInflight.delete(id));

  countsInflight.set(id, promise);
  return promise;
}

export async function campaignCounts(accountId, { force = false } = {}) {
  const id = requireMetaAccountId(accountId);
  const entry = countsCache.get(id);
  const age = entry ? Date.now() - entry.fetchedAt : Infinity;

  const bypass = force && age >= COUNTS_FORCE_MIN_AGE_MS;
  if (!bypass && age < COUNTS_FRESH_MS) {
    return { counts: entry.value, fetchedAt: entry.fetchedAt, source: 'cache', ms: 0 };
  }
  if (!bypass && age < COUNTS_MAX_STALE_MS) {
    refreshCounts(id).catch(error => {
      console.error('[counts] background refresh failed', id, error.message);
    });
    return { counts: entry.value, fetchedAt: entry.fetchedAt, source: 'stale', ms: 0 };
  }

  const fresh = await refreshCounts(id);
  return { counts: fresh.value, fetchedAt: fresh.fetchedAt, source: 'fresh', ms: fresh.ms };
}

export async function activeAdSets(campaignId) {
  const id = requireMetaObjectId(campaignId, 'campaignId');
  const rows = await metaGetAll(`${id}/adsets`, {
    fields: 'id,name,status,effective_status,created_time,optimization_goal',
    effective_status: JSON.stringify(['ACTIVE']),
    limit: 500,
  });
  return rows.filter(x => x.effective_status === 'ACTIVE').map(x => ({
    id: String(x.id),
    name: x.name || '',
    optimizationGoal: x.optimization_goal || '',
    createdTime: x.created_time || '',
  }));
}

// 一次取回所有指定廣告組合的成效，取代逐一呼叫（N 次 → 1 次）。
export async function adSetInsights(accountId, adSetIds, startDate, endDate) {
  const rows = await metaGetAll(`${accountId}/insights`, {
    level: 'adset',
    fields: INSIGHT_FIELDS,
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    filtering: JSON.stringify([{ field: 'adset.id', operator: 'IN', value: adSetIds.map(String) }]),
    limit: 500,
  });

  const grouped = {};
  for (const row of rows) {
    const id = String(row.adset_id || '');
    (grouped[id] ||= []).push(row);
  }
  return grouped;
}

export async function buildIndividualReport(input) {
  const accountId = requireMetaAccountId(input?.accountId);
  const campaignId = requireMetaObjectId(input?.campaignId, 'campaignId');
  const wantedIds = requireMetaObjectIdList(input?.adSetIds, 'adSetIds');
  const { startDate, endDate } = requireDateRange(input?.startDate, input?.endDate);

  const campaigns = await activeCampaigns(accountId);
  const campaign = campaigns.find(x => x.id === campaignId);
  if (!campaign) throw httpError(404, '找不到指定的進行中廣告。');

  const allAdSets = await activeAdSets(campaign.id);
  const wanted = new Set(wantedIds);
  const selected = allAdSets.filter(x => wanted.has(x.id));
  if (selected.length !== wanted.size) {
    throw httpError(409, '廣告組合不存在或已非 ACTIVE。');
  }

  const grouped = await adSetInsights(accountId, wantedIds, startDate, endDate);

  const rows = [];
  const types = [];
  for (const adSet of selected) {
    const current = grouped[adSet.id] || [];
    rows.push(...current);
    if (campaign.type === 'traffic') types.push(resolveTrafficResult(current, adSet));
  }

  let override = null;
  if (campaign.type === 'traffic') {
    const usable = types.filter(x => x.indicator);
    const indicators = [...new Set(usable.map(x => x.indicator))];
    if (indicators.length > 1) {
      throw httpError(409, '所選廣告組合的成果類型不同，請分開回報。');
    }
    override = usable[0] || null;
  }

  const report = campaign.type === 'message'
    ? buildMessageReport(rows)
    : buildTrafficReport(rows, override);

  return { campaign, adSets: selected, period: { startDate, endDate }, reports: [report] };
}
