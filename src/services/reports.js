const TRAFFIC_FEE_RATE = 0.05;
const MESSAGE_ACTION_TYPE = 'onsite_conversion.messaging_conversation_started_7d';

export function detectCampaignType(name) {
  const value = String(name || '');
  if (value.includes('私訊')) return 'message';
  if (value.includes('流量')) return 'traffic';
  return 'other';
}

const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function actionValue(actions, type) {
  if (!Array.isArray(actions)) return 0;
  return num(actions.find(x => x.action_type === type)?.value);
}

function resultTotals(rows) {
  const totals = {};
  for (const row of rows || []) {
    for (const result of row.results || []) {
      const indicator = String(result.indicator || '');
      if (!indicator) continue;
      const value = Array.isArray(result.values)
        ? result.values.reduce((sum, item) => sum + num(item.value), 0)
        : 0;
      totals[indicator] = (totals[indicator] || 0) + value;
    }
  }
  return totals;
}

export function detectTrafficResult(rows) {
  const totals = resultTotals(rows);
  const preferred = [
    ['profile_visit_view', 'IG首頁瀏覽', 'eye'],
    ['actions:link_click', '連結點擊', 'cursor'],
  ];
  for (const [indicator, label, icon] of preferred) {
    if (Object.hasOwn(totals, indicator)) {
      return { indicator, label, icon, count: totals[indicator] };
    }
  }
  const indicator = Object.keys(totals)[0] || '';
  return {
    indicator,
    label: indicator ? '主要成果' : '主要成果',
    icon: 'chart',
    count: indicator ? totals[indicator] : 0,
  };
}

export function inferTrafficResult(optimizationGoal) {
  const goal = String(optimizationGoal || '').toUpperCase();
  if (goal.includes('PROFILE') && goal.includes('VISIT')) {
    return { indicator: 'profile_visit_view', label: 'IG首頁瀏覽', icon: 'eye' };
  }
  if (goal.includes('LINK') && goal.includes('CLICK')) {
    return { indicator: 'actions:link_click', label: '連結點擊', icon: 'cursor' };
  }
  if (goal.includes('LANDING_PAGE')) {
    return { indicator: 'actions:landing_page_view', label: '到達網頁瀏覽', icon: 'eye' };
  }
  return { indicator: goal ? `optimization:${goal}` : '', label: '主要成果', icon: 'chart' };
}

export function resolveTrafficResult(rows, adSet) {
  const actual = detectTrafficResult(rows);
  const base = actual.indicator ? actual : inferTrafficResult(adSet?.optimizationGoal);
  return { ...base, adSetId: String(adSet?.id || ''), adSetName: String(adSet?.name || '') };
}

export function buildMessageReport(rows) {
  let platformSpend = 0;
  let messages = 0;
  for (const row of rows || []) {
    platformSpend += num(row.spend);
    messages += actionValue(row.actions, MESSAGE_ACTION_TYPE);
  }
  return {
    type: 'message',
    label: '私訊型廣告',
    hasData: Array.isArray(rows) && rows.length > 0,
    data: {
      messages,
      costPerMessage: messages > 0 ? platformSpend / messages : null,
      platformSpend,
      actualSpend: platformSpend,
    },
  };
}

export function buildTrafficReport(rows, override) {
  let platformSpend = 0;
  let clicks = 0;
  let impressions = 0;
  for (const row of rows || []) {
    platformSpend += num(row.spend);
    clicks += num(row.clicks);
    impressions += num(row.impressions);
  }
  const actual = detectTrafficResult(rows);
  const resolved = override?.indicator ? override : actual;
  const totals = resultTotals(rows);
  const resultCount = resolved.indicator && !resolved.indicator.startsWith('optimization:')
    ? num(totals[resolved.indicator])
    : 0;
  return {
    type: 'traffic',
    label: '流量型廣告',
    hasData: Array.isArray(rows) && rows.length > 0,
    data: {
      resultIndicator: resolved.indicator || '',
      resultLabel: resolved.label || '主要成果',
      resultIcon: resolved.icon || 'chart',
      resultCount,
      costPerResult: resultCount > 0 ? platformSpend / resultCount : null,
      platformSpend,
      actualSpend: platformSpend * (1 + TRAFFIC_FEE_RATE),
      clicks,
      impressions,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    },
  };
}
