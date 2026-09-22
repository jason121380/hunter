import { metaGetAll } from './meta.js';
import { detectCampaignType, resolveTrafficResult, buildMessageReport, buildTrafficReport } from './reports.js';

const INSIGHT_FIELDS = [
  'campaign_id','campaign_name','adset_id','adset_name','spend','impressions','clicks','ctr',
  'actions','cost_per_action_type','results','cost_per_result'
].join(',');

export async function activeCampaigns(accountId) {
  const rows = await metaGetAll(`${accountId}/campaigns`, {
    fields: 'id,name,status,effective_status,created_time',
    effective_status: JSON.stringify(['ACTIVE']),
    limit: 500,
  });
  return rows
    .filter(x => x.effective_status === 'ACTIVE')
    .map(x => ({
      id: String(x.id),
      name: x.name || '',
      type: detectCampaignType(x.name),
      typeLabel: detectCampaignType(x.name) === 'message' ? '私訊型廣告' : detectCampaignType(x.name) === 'traffic' ? '流量型廣告' : '其他',
      createdTime: x.created_time || '',
    }))
    .filter(x => x.type !== 'other');
}

export async function activeAdSets(campaignId) {
  const rows = await metaGetAll(`${campaignId}/adsets`, {
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

export async function adSetInsights(accountId, adSetId, startDate, endDate) {
  return metaGetAll(`${accountId}/insights`, {
    level: 'adset',
    fields: INSIGHT_FIELDS,
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    filtering: JSON.stringify([{ field: 'adset.id', operator: 'EQUAL', value: String(adSetId) }]),
    limit: 100,
  });
}

export async function buildIndividualReport({ accountId, campaignId, adSetIds, startDate, endDate }) {
  const campaigns = await activeCampaigns(accountId);
  const campaign = campaigns.find(x => x.id === String(campaignId));
  if (!campaign) throw new Error('找不到指定的進行中廣告。');

  const allAdSets = await activeAdSets(campaign.id);
  const wanted = new Set((adSetIds || []).map(String));
  const selected = allAdSets.filter(x => wanted.has(x.id));
  if (!selected.length || selected.length !== wanted.size) throw new Error('廣告組合不存在或已非 ACTIVE。');

  let rows = [];
  const types = [];
  for (const adSet of selected) {
    const current = await adSetInsights(accountId, adSet.id, startDate, endDate);
    rows.push(...current);
    if (campaign.type === 'traffic') types.push(resolveTrafficResult(current, adSet));
  }

  let override = null;
  if (campaign.type === 'traffic') {
    const usable = types.filter(x => x.indicator);
    const indicators = [...new Set(usable.map(x => x.indicator))];
    if (indicators.length > 1) throw new Error('所選廣告組合的成果類型不同，請分開回報。');
    override = usable[0] || null;
  }

  const report = campaign.type === 'message'
    ? buildMessageReport(rows)
    : buildTrafficReport(rows, override);

  return { campaign, adSets: selected, period: { startDate, endDate }, reports: [report] };
}
