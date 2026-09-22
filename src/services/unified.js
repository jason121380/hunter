import { metaGetAll } from './meta.js';
import { activeCampaigns } from './ads.js';
import { requireMetaAccountId, requireDateRange } from '../validate.js';
import { resolveTrafficResult, buildMessageReport, buildTrafficReport } from './reports.js';

const FIELDS = [
  'campaign_id','campaign_name','adset_id','adset_name','spend','impressions','clicks','ctr',
  'actions','cost_per_action_type','results','cost_per_result'
].join(',');

export async function buildUnifiedReport(input) {
  const accountId = requireMetaAccountId(input?.accountId);
  const { startDate, endDate } = requireDateRange(input?.startDate, input?.endDate);

  const campaigns = await activeCampaigns(accountId);
  const campaignIds = new Set(campaigns.map(x => x.id));

  const adSets = (await metaGetAll(`${accountId}/adsets`, {
    fields: 'id,name,effective_status,optimization_goal,campaign_id,campaign{id,name}',
    effective_status: JSON.stringify(['ACTIVE']),
    limit: 500,
  })).filter(x => x.effective_status === 'ACTIVE')
    .map(x => ({
      id: String(x.id), name: x.name || '',
      campaignId: String(x.campaign_id || x.campaign?.id || ''),
      optimizationGoal: x.optimization_goal || '',
    }))
    .filter(x => campaignIds.has(x.campaignId));

  const activeIds = new Set(adSets.map(x => x.id));
  const rows = await metaGetAll(`${accountId}/insights`, {
    level: 'adset', fields: FIELDS,
    time_range: JSON.stringify({ since: startDate, until: endDate }), limit: 500,
  });

  const rowsByAdSet = {};
  for (const row of rows) {
    const id = String(row.adset_id || '');
    if (!activeIds.has(id)) continue;
    (rowsByAdSet[id] ||= []).push(row);
  }

  const items = campaigns.map(campaign => {
    const sets = adSets.filter(x => x.campaignId === campaign.id);
    if (!sets.length) return { status: 'no_active_adsets', campaign, message: '目前沒有 ACTIVE 廣告組合。' };

    let combined = [];
    const types = [];
    for (const set of sets) {
      const setRows = rowsByAdSet[set.id] || [];
      combined.push(...setRows);
      if (campaign.type === 'traffic') types.push(resolveTrafficResult(setRows, set));
    }

    let override = null;
    if (campaign.type === 'traffic') {
      const usable = types.filter(x => x.indicator);
      const indicators = [...new Set(usable.map(x => x.indicator))];
      if (indicators.length > 1) {
        return { status: 'requires_individual', campaign, message: '此廣告包含不同成果目標，請使用個別回報。' };
      }
      override = usable[0] || null;
    }

    const report = campaign.type === 'message'
      ? buildMessageReport(combined)
      : buildTrafficReport(combined, override);

    return {
      status: report.hasData ? 'ok' : 'no_data',
      campaign, adSetCount: sets.length, report,
      message: report.hasData ? '' : '此日期區間沒有可用的成效資料。',
    };
  });

  return {
    period: { startDate, endDate },
    items,
    summary: {
      total: items.length,
      reportable: items.filter(x => x.status === 'ok').length,
      noData: items.filter(x => x.status === 'no_data').length,
      requiresIndividual: items.filter(x => x.status === 'requires_individual').length,
      errors: items.filter(x => ['error','no_active_adsets'].includes(x.status)).length,
    },
  };
}
